
import { DataSource } from "typeorm";
import { User } from "../models/user";
import { Category } from "../models/category";
import { Expense } from "../models/expense";
import { Container } from "typedi";
import { StripeUser } from "../models/stripe_user";

const env = process.env.ENV!;
const psql_host = process.env.PSQL_HOST!;
const psql_port = process.env.PSQL_PORT!;
const psql_db = process.env.PSQL_DB!;
const psql_username = process.env.PSQL_USERNAME!;
const psql_pass = process.env.PSQL_PASS!;

export async function initPSQLConnection() {
    const dataSource = new DataSource({
        type: "postgres",
        applicationName: "exxpenses",

        host: psql_host,
        port: Number(psql_port),

        database: psql_db,
        username: psql_username,
        password: psql_pass,

        synchronize: env === "dev",
        logging: env === "dev",

        entities: [User, Category, Expense, StripeUser]
    });

    console.log(`psql: Connecting to ${psql_host}:${psql_port}`);
    console.log(`psql: Connecting to database ${psql_db} as ${psql_username}`);
    console.log(`psql: Password length: ${psql_pass.length}, ending in "${psql_pass.substring(psql_pass.length - 3)}"`);

    await dataSource.initialize();

    Container.set('psqlDataSource', dataSource);
    Container.set('psqlUserRepo', dataSource.getRepository(User));
    Container.set('psqlCategoryRepo', dataSource.getRepository(Category));
    Container.set('psqlExpenseRepo', dataSource.getRepository(Expense));
    Container.set("psqlStripeUserRepo", dataSource.getRepository(StripeUser));
}

export async function closePSQLConnection() {
    const dataSource = Container.get<DataSource>("psqlDataSource");

    /* Close connection */
    await dataSource.destroy();

    /* Remove from Container */
    Container.remove('psqlDataSource');
    Container.remove('psqlUserRepo');
    Container.remove('psqlCategoryRepo');
    Container.remove('psqlExpenseRepo');
    Container.remove("psqlStripeUserRepo");
}
