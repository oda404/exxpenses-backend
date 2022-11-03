import { Arg, Ctx, Mutation, Query, Resolver } from "type-graphql";
import { QueryFailedError } from "typeorm";
import { Category } from "../models/category";
import { CATEGORY_NAME_LENGTH } from "../models/types";
import { User } from "../models/user";
import { categoryRepo, userRepo } from "../server/data_source";
import { CategoryAddInput, CategoryResposne } from "./category_types";
import { ResolverContext } from "./types";

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

    @Mutation(() => CategoryResposne)
    async categoryAdd(
        @Ctx() { req }: ResolverContext,
        @Arg("categoryAddData") { name, default_currency }: CategoryAddInput
    ): Promise<CategoryResposne> {

        if (req.session.userId === undefined)
            return { error: { name: "Not singed in" } };

        if (name.length > CATEGORY_NAME_LENGTH)
            return { error: { name: `Name can't be longer than ${CATEGORY_NAME_LENGTH} characters`, field: "name" } };

        if (name.length === 0)
            return { error: { name: "Name can't be empty", field: "name" } };

        // TODO validate default_currency

        return categoryRepo.manager.transaction(async (transManager) => {
            const transUserRepo = transManager.getRepository(User);
            const transCategoryRepo = transManager.getRepository(Category);

            const user = await transUserRepo.findOneBy({ id: req.session.userId });
            if (user === null) {
                req.session.destroy(() => { })
                return { error: { name: "Internal server error" } };
            }

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
        })
    }

    @Mutation(() => Boolean)
    async categoryDelete(
        @Ctx() { req }: ResolverContext,
        @Arg("category_name") name: string
    ): Promise<boolean> {

        if (req.session.userId === undefined)
            return false;

        const res = await categoryRepo.delete({ name: name, user: { id: req.session.userId } });
        return res.affected === 1;
    }

    @Query(() => CategoryResposne)
    async categoriesGet(
        @Ctx() { req }: ResolverContext,
    ): Promise<CategoryResposne> {

        if (req.session.userId === undefined)
            return { error: { name: "Not logged in" } };

        // TODO: Add indexing so we dont fetch all the categories
        const user = await userRepo.findOne({
            where: { id: req.session.userId },
            relations: ["categories"]
        });

        if (user === null) {
            req.session.destroy(() => { });
            return { error: { name: "Internal server error" } };
        }

        return { categories: user.categories };
    }
};
