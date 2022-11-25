import Decimal from "decimal.js";
import { Arg, Ctx, Mutation, Query, Resolver } from "type-graphql";
import { Between, LessThan, MoreThan, Repository } from "typeorm";
import { Category } from "../models/category";
import { Expense } from "../models/expense";
import { CURRENCY_LENGTH, EXPENSE_DESCRIPTION_LENGTH } from "../models/types";
import { expenseRepo } from "../server/data_source";
import { ExpenseAddInput, ExpenseDeleteInput, ExpenseEditInput, ExpenseResponse, ExpensesCostResponse, ExpensesCostResponseMultiple, ExpensesGetInput, ExpensesGetInputMultiple, ExpenseTotalCostMultiple } from "./expense_types";
import { ResolverContext } from "./types";

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

    if (since !== undefined && until !== undefined) {
        /* Get expenses that happened in a given time frame */
        expenses = await repo.find({
            where: { category: category, date: Between(since, until) }
        });
    }
    else if (since !== undefined) {
        /* Get expenses that happened after a given date */
        expenses = await repo.find({
            where: { category: category, date: MoreThan(since) }
        });
    }
    else if (until !== undefined) {
        /* Get expenses that happened before a given date*/
        expenses = await repo.find({
            where: { category: category, date: LessThan(until) }
        });
    }
    else {
        /* Get all expenses for this category */
        expenses = await repo.find({
            where: { category: category }
        });
    }

    return expenses;
}

@Resolver(Expense)
export class ExpenseResolver {

    @Mutation(() => ExpenseResponse)
    async expenseAdd(
        @Ctx() { req }: ResolverContext,
        @Arg("expenseAddData") { category_name, price, description, currency, date }: ExpenseAddInput
    ): Promise<ExpenseResponse> {

        if (req.session.userId === undefined)
            return { error: { name: "Not singed in" } };

        if (price <= 0)
            return { error: { name: "Invalid price", field: "price" } };

        if (description !== undefined) {
            if (description.length > EXPENSE_DESCRIPTION_LENGTH)
                return { error: { name: "Description can't be longer than 60 characters", field: "description" } };
        }

        // TODO further validate currency
        if (currency.length > CURRENCY_LENGTH)
            return { error: { name: `Currency's name can't be longer than ${CURRENCY_LENGTH} characters`, field: "currency" } }

        // Execute all of this shit in a transaction to avoid any race conditions
        return expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            const category = await transCategoryRepo.findOne({
                where: { name: category_name, user: { id: req.session.userId } }
            });

            if (category === null)
                return { error: { name: "Category doesn't exist, try creating it first", field: "category_name" } };

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

    @Mutation(() => ExpenseResponse)
    async expenseEdit(
        @Ctx() { req }: ResolverContext,
        @Arg("expenseEditData") { category_name, expense_id, price, currency, date }: ExpenseEditInput
    ): Promise<ExpenseResponse> {

        if (req.session.userId === undefined)
            return { error: { name: "Not logged in" } };

        if (price <= 0)
            return { error: { name: "Invalid price", field: "price" } };

        /* TODO: further validate currency */
        if (currency.length > CURRENCY_LENGTH)
            return { error: { name: `Currency's name can't be longer than ${CURRENCY_LENGTH} characters`, field: "currency" } }

        // Execute all of this shit in a transaction to avoid any race conditions
        return expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            const category = await transCategoryRepo.findOneBy({ name: category_name, user: { id: req.session.userId } });
            if (category === null)
                return { error: { name: "Category doesn't exist, try creating it first" } };

            const expense = await transExpenseRepo.findOneBy({ id: expense_id, category: category });
            if (expense === null) {
                return { error: { name: "Expense doesn't exist", field: expense_id } };
            }

            expense.price = price;
            expense.currency = currency;
            expense.date = date;

            let res = await transExpenseRepo.save(expense);
            return { expenses: [res] };
        })
    }

    @Mutation(() => Boolean)
    async expenseDelete(
        @Ctx() { req }: ResolverContext,
        @Arg("expenseDeleteData") { expense_id, category_name }: ExpenseDeleteInput
    ): Promise<boolean> {

        if (req.session.userId === null)
            return false;

        /* Execute everything inside of a transaction to avoid race conditions */
        return expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            const categ = await transCategoryRepo.findOne({
                where: { name: category_name, user: { id: req.session.userId } }
            });

            if (categ === null)
                return false;

            const res = await transExpenseRepo.delete({ id: expense_id, category: categ });
            return res.affected === 1;
        })
    }

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

        return expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            // MAYBE TODO: does frontend really need to know if there is no category with this name ?
            const category = await transCategoryRepo.findOne({
                where: { name: category_name, user: { id: req.session.userId } }
            });

            if (category === null)
                return { error: { name: "Category doesn't exist, try creating it first", field: "category_name" } };

            let expenses = await getExpensesWithDate(since, until, category, transExpenseRepo);
            return { expenses: expenses };
        })
    }

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

        return expenseRepo.manager.transaction(async (transManager) => {
            const transCategoryRepo = transManager.getRepository(Category);
            const transExpenseRepo = transManager.getRepository(Expense);

            // MAYBE TODO: does frontend really need to know if there is no category with this name ?
            const category = await transCategoryRepo.findOne({
                where: { name: category_name, user: { id: req.session.userId } }
            });

            if (category === null)
                return { error: { name: "Category doesn't exist, try creating it first", field: "category_name" } };

            let expenses = await getExpensesWithDate(since, until, category, transExpenseRepo);

            let res: ExpensesCostResponse = {
                costs: []
            };

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
            })

            return res;
        });
    }

    @Query(() => ExpensesCostResponseMultiple)
    async expensesTotalCostGetMultiple(
        @Ctx() { req }: ResolverContext,
        @Arg("expenseGetData") { category_names, since, until }: ExpensesGetInputMultiple
    ): Promise<ExpensesCostResponseMultiple> {

        if (req.session.userId === undefined)
            return { error: { name: "Not singed in" } };

        if (category_names.length === 0)
            return { error: { name: "At least one category name is required!" } };

        if (since !== undefined && until !== undefined) {
            if (since.getTime() >= until.getTime())
                return { error: { name: "Since can't be bigger than until" } };
        }

        return expenseRepo.manager.transaction(async (transManager) => {
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
                    relations: ["expenses"],
                });

                if (category === null)
                    return { error: { name: "Category doesn't exist, try creating it first", field: "category_name" } };

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

            res.costs?.forEach(c => {
                console.log(c.total)
            })

            return res;
        });
    }
};
