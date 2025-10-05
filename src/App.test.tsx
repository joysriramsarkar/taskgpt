import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the main container with tailwind classes', () => {
  render(<App />);
  const mainContainer = screen.getByText('টাস্ক অ্যাপ — ইতিহাস, পরিসংখ্যান ও পুনরাবৃত্তি').closest('div.p-4');
  expect(mainContainer).toHaveClass('min-h-screen', 'bg-slate-50', 'p-4');
});