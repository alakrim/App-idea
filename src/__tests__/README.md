# `src/__tests__`

App-level tests (Jest `app` project) for screens in `app/`. Route files stay in `app/` and must not contain tests, because expo-router would treat them as routes.

**Import rules**

- Test files import the route modules by relative path, plus `@testing-library/react-native`.
- Mock the network and native modules. Never call a paid API.
