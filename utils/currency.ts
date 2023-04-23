
export default function is_currency_valid(currency: string) {
    return currency.length > 0 && currency.length <= 3;
}
