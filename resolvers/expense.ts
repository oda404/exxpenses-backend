import Decimal from "decimal.js";
import { Arg, Ctx, Mutation, Query, Resolver } from "type-graphql";
import Container from "typedi";
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from "typeorm";
import { Category } from "../models/category";
import { Expense } from "../models/expense";
import { CATEGORY_NAME_LENGTH, CURRENCY_LENGTH, EXPENSE_DESCRIPTION_LENGTH } from "../models/types";
import { ExpenseAddInput, ExpenseDeleteInput, ExpenseEditInput, ExpenseResponse, ExpensesCostResponse, ExpensesCostResponseMultiple, ExpensesGetInput, ExpensesGetInputMultiple } from "./expense_types";
import { ResolverContext } from "./types";
import development_reminder_ensure_logged_in from "./ensure_logged_in";
import is_currency_valid from "../utils/currency";
import { User } from "../models/user";
import { PLAN_FREE, PLAN_FREE_MAX_EXPENSES } from "../utils/plan";
import { clear_user_session } from "../utils/user_session";

/* Return an UserResponse based on the Postgres exception we are given. */
// function psqlErrorToResponse(e: any): ExpenseResponse {

//     if (e instanceof QueryFailedError) {
//         const code = e.driverError.code as string;
//         const detail = e.driverError.detail as string;

//         if (code === undefined || detail === undefined)
//             return { error: { name: "Internal server error!" } };

//         switch (code) {
//             case '23505': // Unique key constraint violation
//                 // FIXME: as of writing this code, this is the only unique constraint we have :)
//                 return { error: { field: "name", name: "This category already exists!" } };

//             default:
//                 break;
//         }
//     }

//     return { error: { name: "Internal server error!" } };
// }

async function getExpensesWithDate(since: Date | undefined, until: Date | undefined, category: Category, repo: Repository<Expense>) {
    let expenses: Expense[] = [];

    const dSince = since ? new Date(since) : undefined;
    const dUntil = until ? new Date(until) : undefined;

    if (dSince !== undefined && dUntil !== undefined) {
        /* Get expenses that happened in a given time frame */
        expenses = await repo.find({
            where: { category: { id: category.id }, date: Between(dSince, dUntil) }
        });
    }
    else if (dSince !== undefined) {
        /* Get expenses that happened after a given date */
        expenses = await repo.find({
            where: { category: { id: category.id }, date: MoreThanOrEqual(dSince) }
        });
    }
    else if (dUntil !== undefined) {
        /* Get expenses that happened before a given date*/
        expenses = await repo.find({
            where: { category: { id: category.id }, date: LessThanOrEqual(dUntil) }
        });
    }
    else {
        /* Get all expenses for this category */
        expenses = await repo.find({
            where: { category: { id: category.id } }
        });
    }

    return expenses;
}

@Resolver(Expense)
export class ExpenseResolver {

    private readonly expenseRepo = Container.get<Repository<Expense>>("psqlExpenseRepo");

    @development_reminder_ensure_logged_in()
    @Mutation(() => ExpenseResponse)
    async expenseAdd(
        @Ctx() { req, res }: ResolverContext,
        @Arg("expenseAddData") { category_name, price, description, currency, date }: ExpenseAddInput
    ): Promise<ExpenseResponse> {
        if (req.session.userId === undefined)
            return { error: { name: "Not singed in" } };

        category_name = category_name.trim();
        description = description?.trim();
        currency = currency.trim();

        if (price <= 0)
            return { error: { name: "Invalid price", field: "price" } };

        if (description !== undefined) {
            if (description.length === 0)
                return { error: { name: "Description can't be empty", field: "description" } };

            if (description.length > EXPENSE_DESCRIPTION_LENGTH)
                return { error: { name: "Description can't be longer than 60 characters", field: "description" } };
        }

        if (!is_currency_valid(currency))
            return { error: { name: "Invalid currency", field: "currency" } };

        // TODO: validate date?

        // Execute all of this shit in a transaction to avoid any race conditions
        return this.expenseRepo.manager.transaction(async (transManager) => {
            const userTransRepo = transManager.getRepository(User);
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            /* This should be one single query and left join categories where ... */
            const user = await userTransRepo.findOneBy({ id: req.session.userId });
            if (user === null) {
                clear_user_session(req, res);
                return { error: { name: "Internal server error" } };
            }

            const category = await transCategoryRepo.findOneBy({ name: category_name, user: { id: req.session.userId } });
            if (category === null)
                return { error: { name: "Category doesn't exist, try creating it first", field: "category" } };

            if (user.plan === PLAN_FREE) {
                let start_of_month = new Date(date.getFullYear(), date.getMonth(), 1);
                let end_of_month = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                let expense_count = (await getExpensesWithDate(start_of_month, end_of_month, category, transExpenseRepo)).length;
                if (expense_count >= PLAN_FREE_MAX_EXPENSES)
                    return { error: { name: `Free accounts are limited to ${PLAN_FREE_MAX_EXPENSES} monthly expenses per category, plase consider switching to a premium plan.` } };
            }

            let partexpense: Partial<Expense> = {
                price: price,
                description: description,
                currency: currency,
                date: date,
                category: category
            };

            try {
                const expense = await transExpenseRepo.save(partexpense);
                return { expenses: [expense] };
            }
            catch (e) {
                /* FIXMLE Will happen for very big price values :) */
                return { error: { name: "Unhandled internel server error" } };
            }
        })
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => ExpenseResponse)
    async expenseEdit(
        @Ctx() { req }: ResolverContext,
        @Arg("expenseEditData") { category_name, expense_id, price, currency, date }: ExpenseEditInput
    ): Promise<ExpenseResponse> {
        if (req.session.userId === undefined)
            return { error: { name: "Not logged in" } };

        category_name = category_name.trim();
        // description = description?.trim();
        currency = currency.trim();

        if (price <= 0)
            return { error: { name: "Invalid price", field: "price" } };

        // if (description !== undefined) {
        //     if (description.length === 0)
        //         return { error: { name: "Description can't be empty", field: "description" } };

        //     if (description.length > EXPENSE_DESCRIPTION_LENGTH)
        //         return { error: { name: "Description can't be longer than 60 characters", field: "description" } };
        // }

        if (!is_currency_valid(currency))
            return { error: { name: "Invalid currency", field: "currency" } };

        // Execute all of this shit in a transaction to avoid any race conditions
        return this.expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            const category = await transCategoryRepo.findOneBy({ name: category_name, user: { id: req.session.userId } });
            if (category === null)
                return { error: { name: "Category doesn't exist." } };

            const expense = await transExpenseRepo.findOneBy({ id: expense_id, category: { id: category.id } });
            if (expense === null)
                return { error: { name: "Expense doesn't exist", field: expense_id } };

            expense.price = price;
            expense.currency = currency;
            expense.date = date;

            try {
                let res = await transExpenseRepo.save(expense);
                return { expenses: [res] };
            }
            catch (e) {
                return { errors: { name: "Internal server error. Either that or you're being a bitch :)" } };
            }
        })
    }

    @development_reminder_ensure_logged_in()
    @Mutation(() => Boolean)
    async expenseDelete(
        @Ctx() { req }: ResolverContext,
        @Arg("expenseDeleteData") { expense_id, category_name }: ExpenseDeleteInput
    ): Promise<boolean> {
        if (req.session.userId === null)
            return false;

        /* Execute everything inside of a transaction to avoid race conditions */
        return this.expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            const categ = await transCategoryRepo.findOne({
                where: { name: category_name, user: { id: req.session.userId } }
            });

            if (categ === null)
                return false;

            const res = await transExpenseRepo.delete({ id: expense_id, category: { id: categ.id } });
            return res.affected === 1;
        })
    }

    @development_reminder_ensure_logged_in()
    @Query(() => ExpenseResponse)
    async expensesGet(
        @Ctx() { req }: ResolverContext,
        @Arg("expenseGetData") { category_name, since, until }: ExpensesGetInput
    ): Promise<ExpenseResponse> {
        if (req.session.userId === undefined)
            return { error: { name: "Not singed in" } };

        if (since !== undefined && until !== undefined) {
            if (since.getTime() >= until.getTime())
                return { error: { name: "Since can't be bigger than until" } };
        }

        return this.expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            // MAYBE TODO: does frontend really need to know if there is no category with this name ?
            const category = await transCategoryRepo.findOne({
                where: { name: category_name, user: { id: req.session.userId } }
            });

            if (category === null)
                return { error: { name: "Category doesn't exist, try creating it first", field: "category" } };

            let expenses = await getExpensesWithDate(since, until, category, transExpenseRepo);
            return { expenses: expenses };
        })
    }

    @development_reminder_ensure_logged_in()
    @Query(() => ExpensesCostResponse)
    async expensesTotalCostGet(
        @Ctx() { req }: ResolverContext,
        @Arg("expenseGetData") { category_name, since, until }: ExpensesGetInput
    ): Promise<ExpensesCostResponse> {
        if (req.session.userId === undefined)
            return { error: { name: "Not singed in" } };

        if (since !== undefined && until !== undefined) {
            if (since.getTime() >= until.getTime())
                return { error: { name: "Since can't be bigger than until" } };
        }

        return this.expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            // MAYBE TODO: does frontend really need to know if there is no category with this name ?
            const category = await transCategoryRepo.findOne({
                where: { name: category_name, user: { id: req.session.userId } }
            });

            if (category === null)
                return { error: { name: "Category doesn't exist, try creating it first", field: "category" } };

            let expenses = await getExpensesWithDate(since, until, category, transExpenseRepo);

            let res: ExpensesCostResponse = { costs: [] };
            expenses.forEach((expense) => {
                let idx = res.costs!.findIndex(e => e.currency === expense.currency);

                if (idx === -1) {
                    res.costs!.push({ price: expense.price, currency: expense.currency });
                }
                else {
                    // MAYBE FIXME: stop creaing new instances every itteration :)
                    let x = new Decimal(res.costs![idx].price);
                    let y = new Decimal(expense.price);
                    res.costs![idx].price = x.add(y).toNumber();
                }
            });
            return res;
        });
    }

    @development_reminder_ensure_logged_in()
    @Query(() => ExpensesCostResponseMultiple)
    async expensesTotalCostGetMultiple(
        @Ctx() { req }: ResolverContext,
        @Arg("expenseGetData") { category_names, since, until }: ExpensesGetInputMultiple
    ): Promise<ExpensesCostResponseMultiple> {

        if (req.session.userId === undefined)
            return { error: { name: "Not singed in" } };

        if (since !== undefined && until !== undefined) {
            if (since.getTime() >= until.getTime())
                return { error: { name: "Since can't be bigger than until" } };
        }

        return this.expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            let res: ExpensesCostResponseMultiple = {
                costs: category_names.map(c => {
                    return {
                        category_name: c,
                        total: []
                    };
                })
            };

            /* FIXME: parallelize this loop */
            for (let i = 0; i < category_names.length; ++i) {
                const c = category_names[i];
                // MAYBE TODO: does frontend really need to know if there is no category with this name ?
                // FIXME: somehow get all expenses needed in one query ?
                const category = await transCategoryRepo.findOne({
                    where: { name: c, user: { id: req.session.userId } },
                });

                if (category === null)
                    return { error: { name: "Category doesn't exist, try creating it first", field: "category" } };

                let expenses = await getExpensesWithDate(since, until, category, transExpenseRepo);

                /* We know catIdx will be found since we just added it above */
                let catIdx = res.costs?.findIndex(o => o.category_name === c)!;

                expenses.forEach((expense) => {
                    let idx = res.costs![catIdx].total.findIndex(e => e.currency === expense.currency);

                    if (idx === -1) {
                        res.costs![catIdx].total.push({ price: expense.price, currency: expense.currency });
                    }
                    else {
                        // MAYBE FIXME: stop creaing new instances every itteration :)
                        let x = new Decimal(res.costs![catIdx].total[idx].price);
                        let y = new Decimal(expense.price);
                        res.costs![catIdx].total[idx].price = x.add(y).toNumber();
                    }
                })
            }

            return res;
        });
    }
};
