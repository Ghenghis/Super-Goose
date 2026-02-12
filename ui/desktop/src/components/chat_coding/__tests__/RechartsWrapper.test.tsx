import { render, screen } from '@testing-library/react';
import { lucideReactMock } from './helpers';
import RechartsWrapper from '../RechartsWrapper';

vi.mock('lucide-react', () => lucideReactMock);

const sampleData = [
  { name: 'Jan', value: 100 },
  { name: 'Feb', value: 200 },
  { name: 'Mar', value: 150 },
];

describe('RechartsWrapper', () => {
  it('renders "No data" when data is empty', () => {
    render(
      <RechartsWrapper data={[]} type="bar" xKey="name" yKey="value" />
    );
    expect(screen.getByText('No data to display')).toBeInTheDocument();
  });

  it('renders SVG chart with data', () => {
    const { container } = render(
      <RechartsWrapper data={sampleData} type="bar" xKey="name" yKey="value" />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders bar chart with rect elements', () => {
    const { container } = render(
      <RechartsWrapper data={sampleData} type="bar" xKey="name" yKey="value" />
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(3);
  });

  it('renders title when provided', () => {
    render(
      <RechartsWrapper
        data={sampleData}
        type="bar"
        xKey="name"
        yKey="value"
        title="Sales Data"
      />
    );
    expect(screen.getByText('Sales Data')).toBeInTheDocument();
  });

  it('renders x-axis labels', () => {
    render(
      <RechartsWrapper data={sampleData} type="bar" xKey="name" yKey="value" />
    );
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
    expect(screen.getByText('Mar')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <RechartsWrapper
        data={sampleData}
        type="bar"
        xKey="name"
        yKey="value"
        className="custom-chart"
      />
    );
    expect(container.firstChild).toHaveClass('custom-chart');
  });
});
