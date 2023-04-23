
import { Request, Response } from "express";

export function clear_user_session(req: Request, res: Response) {
    req.session.destroy(() => { });
    res.clearCookie("user_session");
}
