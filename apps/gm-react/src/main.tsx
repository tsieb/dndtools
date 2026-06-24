import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { Toaster } from './ds';
import { App } from './App';

// Safety net for a durable-write failure: `SceneRuntime.dispatch` rolls back and RE-THROWS on a persist
// failure (PLAT-018), so a caller that only inspects `result.status` would let it escape as an unhandled
// rejection with no user feedback. Surface it as a toast instead of failing silently.
window.addEventListener('unhandledrejection', () => {
	Toaster.error('Something didn’t save — please try that again.');
});

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');
createRoot(container).render(<App />);
