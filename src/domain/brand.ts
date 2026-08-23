export type Brand<Value, Tag extends string> = Value & { readonly __brand: Tag };
