
import nodemailer from "nodemailer";

const noreply_mail_user = process.env.NOREPLY_MAIL_USER;
const noreply_mail_pass = process.env.NOREPLY_MAIL_PASS;

export const noReplyMailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: noreply_mail_user,
        pass: noreply_mail_pass
    }
});
