import { createRoot } from 'react-dom/client';
import { initialiseEstateTheme } from '@sangeev/estate-ui';
import App from './App';
import './styles.css';
initialiseEstateTheme();
createRoot(document.getElementById('root')!).render(<App />);
