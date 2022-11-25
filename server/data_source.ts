
import { DataSource } from "typeorm";
import { User } from "../models/user";
import { Category } from "../models/category";
import { Expense } from "../models/expense";

const env = process.env.ENV!;
const psql_host = process.env.PSQL_HOST!;
const psql_port = process.env.PSQL_PORT!;
const psql_db = process.env.PSQL_DB!;
const psql_username = process.env.PSQL_USERNAME!;
const psql_pass = process.env.PSQL_PASS!;

export const exxpensesDataSource = new DataSource({
    type: "postgres",
    applicationName: "exxpenses",

    host: psql_host,
    port: Number(psql_port),

    database: psql_db,
    username: psql_username,
    password: psql_pass,

    synchronize: env === "dev",
    logging: env === "dev",

    entities: [User, Category, Expense]
});

export const userRepo = exxpensesDataSource.getRepository(User);
export const categoryRepo = exxpensesDataSource.getRepository(Category);
export const expenseRepo = exxpensesDataSource.getRepository(Expense);

