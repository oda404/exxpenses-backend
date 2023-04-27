import { IncomingHttpHeaders } from "http";
import fetch from "node-fetch";

const turnstile_verify_url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const turnstile_managed_key = process.env.TURNSTILE_MANAGED_KEY!;

export async function turnstile_verify_managed(token: string, headers: IncomingHttpHeaders) {

    let form = new URLSearchParams();
    form.append("secret", turnstile_managed_key);
    form.append("response", token);
    let ip = headers["CF-Connecting-IP"];
    if (ip)
        form.append("remoteip", ip as string);

    const result = await fetch(turnstile_verify_url, {
        body: form,
        method: 'POST',
    });

    const res = await result.json() as any;
    return res["success"] === true;
}
