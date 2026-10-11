// Drizzle migrations are imported as strings. babel-plugin-inline-import inlines them at bundle time.
declare module '*.sql' {
  const content: string;
  export default content;
}
