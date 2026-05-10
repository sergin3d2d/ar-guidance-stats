import React from 'react';

const StatsCard = ({ title, value, subtitle, icon, trend, trendUp }) => {
    // Graceful fallback for arrays returning 0 length maths
    const displayValue = (typeof value === 'string' && (value.includes('Infinity') || value.includes('NaN')))
        ? 'N/A'
        : value;

    return (
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '5px' }}>
                {icon && <div style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center' }}>{icon}</div>}
                <span className="stat-label" style={{ fontWeight: 600, color: 'var(--text-dim)' }}>{title}</span>
            </div>
            <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                {displayValue}
            </div>
            {subtitle && !displayValue.includes('N/A') && (
                <div style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 500 }}>
                    {subtitle}
                </div>
            )}
            {trend && (
                <div style={{ fontSize: '0.85rem', color: trendUp ? 'var(--accent)' : 'var(--primary)', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--glass-border)' }}>
                    {trend}
                </div>
            )}
        </div>
    );
};

export default StatsCard;
