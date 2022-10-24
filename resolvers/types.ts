
/* Used for letting the user know which field is wrong, if any. */
import {Field, ObjectType} from "type-graphql";

@ObjectType()
export class GenericFieldError
{
    @Field()
    name: string;

    @Field({ nullable: true })
    field?: string;
};
