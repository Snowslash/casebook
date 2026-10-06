import { createRoot } from 'react-dom/client';
import { initialiseEstateTheme } from '@sangeev/estate-ui';
import LandingPage from './LandingPage';
import './styles.css';
initialiseEstateTheme();
createRoot(document.getElementById('root')!).render(<LandingPage />);
