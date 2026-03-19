import Feed from "./pages/Feed";
import { AppNav } from "./components/AppNav";
import { LanguageProvider } from "./lib/language";

const App = () => (
  <LanguageProvider>
    <>
      <AppNav />
      <Feed />
    </>
  </LanguageProvider>
);

export default App;
