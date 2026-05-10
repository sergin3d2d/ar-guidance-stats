import React from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const ComparisonChart = ({ title, data }) => {
    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: 'var(--text-dim)',
                    font: { family: 'Outfit' }
                }
            },
            title: {
                display: true,
                text: title,
                color: 'var(--text)',
                font: { size: 18, family: 'Outfit' }
            },
        },
        scales: {
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: 'var(--text-dim)' }
            },
            x: {
                grid: { display: false },
                ticks: { color: 'var(--text-dim)' }
            }
        }
    };

    const chartData = {
        labels: Object.keys(data),
        datasets: [
            {
                label: title,
                data: Object.values(data).map(d => d.mean),
                backgroundColor: [
                    'rgba(0, 242, 255, 0.6)',
                    'rgba(112, 0, 255, 0.6)',
                    'rgba(255, 0, 122, 0.6)',
                ],
                borderColor: [
                    '#00f2ff',
                    '#7000ff',
                    '#ff007a',
                ],
                borderWidth: 1,
                borderRadius: 8,
            },
        ],
    };

    return (
        <div className="glass-card" style={{ gridColumn: 'span 2' }}>
            <Bar options={options} data={chartData} />
        </div>
    );
};

export default ComparisonChart;
