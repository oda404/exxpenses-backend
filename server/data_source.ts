
import {DataSource} from "typeorm";
import {User} from "../models/user";
import {Category} from "../models/category";
import {Expense} from "../models/expense";

export const exxpensesDataSource = new DataSource({
    type: "postgres",
    applicationName: "exxpenses",

    host: "192.168.2.69",
    port: 5432,

    database: "exxpenses_dev",
    username: "dev",
    password: "dev",

    synchronize: true,
    logging: true,

    entities: [ User, Category, Expense ]
});

export const userRepo = exxpensesDataSource.getRepository(User);
