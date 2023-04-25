import { Arg, Ctx, Mutation, Query, Resolver } from "type-graphql";
import Container from "typedi";
import { QueryFailedError, Repository } from "typeorm";
import { Category } from "../models/category";
import { CATEGORY_NAME_LENGTH } from "../models/types";
import { User } from "../models/user";
import { CategoryAddInput, CategoryEditInput, CategoryResposne } from "./category_types";
import { ResolverContext } from "./types";
import development_reminder_ensure_logged_in from "./ensure_logged_in";
import is_currency_valid from "../utils/currency";
import { clear_user_session } from "../utils/user_session";
import { PLAN_FREE, PLAN_FREE_MAX_CATEGS } from "../utils/plan";

/* Return an UserResponse based on the Postgres exception we are given. */
function psqlErrorToResponse(e: any): CategoryResposne {

    if (e instanceof QueryFailedError) {
        const code = e.driverError.code as string;
        const detail = e.driverError.detail as string;

        if (code === undefined || detail === undefined)
            return { error: { name: "Internal server error!" } };

        switch (code) {
            case '23505': // Unique key constraint violation
                // FIXME: as of writing this code, this is the only unique constraint we have :)
                return { error: { field: "name", name: "This category already exists!" } };

            default:
                break;
        }
    }

    return { error: { name: "Internal server error!" } };
}

@Resolver(Category)
export class CategoryResolver {

    private readonly userRepo = Container.get<Repository<User>>("psqlUserRepo");
    private readonly categoryRepo = Container.get<Repository<Category>>("psqlCategoryRepo");

    @development_reminder_ensure_logged_in()
    @Mutation(() => CategoryResposne)
    async categoryAdd(
        @Ctx() { req, res }: ResolverContext,
        @Arg("categoryAddData") { name, default_currency }: CategoryAddInput
    ): Promise<CategoryResposne> {
        if (req.session.userId === undefined)
            return { error: { name: "Not singed in" } };

        name = name.trim();
        default_currency = default_currency.trim();

        if (name.length > CATEGORY_NAME_LENGTH)
            return { error: { name: `Name can't be longer than ${CATEGORY_NAME_LENGTH} characters`, field: "name" } };

        if (name.length === 0)
            return { error: { name: "Name can't be empty", field: "name" } };

        if (!is_currency_valid(default_currency))
            return { error: { name: "Invalid currency", field: "currency" } };

        return this.categoryRepo.manager.transaction(async (transManager) => {
            const transUserRepo = transManager.getRepository(User);
            const transCategoryRepo = transManager.getRepository(Category);

            const user = await transUserRepo
                .createQueryBuilder('user')
                .where("user.id=:id", { id: req.session.userId })
                .loadRelationCountAndMap('user.categoryCount', 'user.categories') // count posts for each user
                .getOne();

            if (user === null) {
                clear_user_session(req, res);
                return { error: { name: "Internal server error" } };
            }

            if (user.plan === PLAN_FREE && user.categoryCount! >= PLAN_FREE_MAX_CATEGS)
                return { error: { name: `Free accounts are limited to ${PLAN_FREE_MAX_CATEGS} categories, plase consider switching to a premium account.` } };

            let partcateg: Partial<Category> = {
                name: name,
                default_currency: default_currency,
                user: user
            };

            try {
                let categ = await transCategoryRepo.save(partcateg);
                return { categories: [categ] };
            }
            catch (e) {
                return psqlErrorToResponse(e);
            }
        });
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => Boolean)
    async categoryDelete(
        @Ctx() { req }: ResolverContext,
        @Arg("category_name") name: string
    ): Promise<boolean> {
        if (req.session.userId === undefined)
            return false;

        name = name.trim();

        /* I don't actually know if this function throws at any point since the docs don't fucking say anything. 
        So better defined than sorry :) */
        try {
            const res = await this.categoryRepo.delete({ name: name, user: { id: req.session.userId } });
            return res.affected === 1;
        }
        catch (e) {
            return false;
        }
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => Boolean)
    async categoryEdit(
        @Ctx() { req }: ResolverContext,
        @Arg("categoryEditData") category: CategoryEditInput
    ) {
        if (req.session.userId === undefined)
            return { error: { name: "Not singed in" } };

        category.name = category.name.trim();
        category.default_currency = category.default_currency.trim();

        if (category.name.length > CATEGORY_NAME_LENGTH)
            return { error: { name: `Name can't be longer than ${CATEGORY_NAME_LENGTH} characters`, field: "name" } };

        if (category.name.length === 0)
            return { error: { name: "Name can't be empty", field: "name" } };

        if (!is_currency_valid(category.default_currency))
            return { error: { name: "Invalid currency", field: "currency" } };

        try {
            let result = await this.categoryRepo.update(
                { id: category.id, user: { id: req.session.userId } },
                { name: category.name, default_currency: category.default_currency }
            );
            return result.affected === 1;
        }
        catch (e) {
            return false;
        }
    }

    @development_reminder_ensure_logged_in()
    @Query(() => CategoryResposne)
    async categoriesGet(
        @Ctx() { req, res }: ResolverContext,
    ): Promise<CategoryResposne> {
        if (req.session.userId === undefined)
            return { error: { name: "Not logged in" } };

        // TODO: Add indexing so we dont fetch all the categories
        const user = await this.userRepo.findOne({
            where: { id: req.session.userId },
            relations: ["categories"]
        });

        if (user === null) {
            clear_user_session(req, res);
            return { error: { name: "Internal server error" } };
        }

        return { categories: user.categories };
    }

    @development_reminder_ensure_logged_in()
    @Query(() => CategoryResposne)
    async categoryGet(
        @Ctx() { req }: ResolverContext,
        @Arg("categoryName") name: string
    ): Promise<CategoryResposne> {
        if (req.session.userId === undefined)
            return { error: { name: "Not logged in" } };

        name = name.trim();

        const category = await this.categoryRepo.findOne({
            where: { name: name, user: { id: req.session.userId } }
        });

        if (category === null)
            return { error: { name: "No such category", field: "name" } };

        return { categories: [category] };
    }
};
