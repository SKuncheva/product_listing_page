import "./App.css";

import { Header } from "./Components/Header/Header";
import { Footer } from "./Components/Footer/Footer";
import { GenderProvider } from "./Components/Context/Context";
import { Catalog } from "./Components/Catalog/Catalog";
import { Banner } from "./Components/Banner/Banner";

function App() {
  return (
    <>
      <GenderProvider>
        <Header />
        <Banner />
        <main>
          <Catalog />
        </main>
        <Footer />
      </GenderProvider>
    </>
  );
}

export default App;
