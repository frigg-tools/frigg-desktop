import { LangProvider } from './i18n';
import Header from './components/Header';
import Hero from './components/Hero';
import ToolShowcase from './components/ToolShowcase';
import HowItWorks from './components/HowItWorks';
import Download from './components/Download';
import Footer from './components/Footer';

export default function App() {
  return (
    <LangProvider>
      <Header />
      <main>
        <Hero />
        <ToolShowcase />
        <HowItWorks />
        <Download />
      </main>
      <Footer />
    </LangProvider>
  );
}
