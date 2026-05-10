import React from 'react';
import { getColor } from '../utils/colors';

const SurveyAnalytics = ({ participantData, participantId }) => {
    const surveys = participantData?.surveys || { pre_experiment: {}, nasa_tlx: {}, pcueq: {}, final_preference: {} };

    const nasaTexts = {
        q0: 'Mental Demand: How mentally demanding was the task?',
        q1: 'Physical Demand: How physically demanding was the task?',
        q2: 'Temporal Demand: How hurried or rushed was the pace?',
        q3: 'Performance: How successful do you think you were?',
        q4: 'Effort: How hard did you have to work to accomplish your level of performance?',
        q5: 'Frustration: How insecure, discouraged, irritated, or stressed did you feel?'
    };

    const pcueqCategories = {
        'Usability & Helpfulness': ['A1', 'A2', 'A3', 'A4', 'A5'],
        'Visual Quality & Perception': ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'],
        'Physical & Visual Comfort': ['C1', 'C2', 'C3', 'C4'],
        'Overall Experience & Affect': ['D1', 'D2']
    };

    const pcueqTexts = {
        A1: "I found the guidance system was easy to use.",
        A2: "The information provided by the guidance system was easy to understand.",
        A3: "I felt confident in completing the tasks using this system's guidance.",
        A4: "I think I would need a lot of practice to become skillful with this system.",
        A5: "I felt the guidance was helpful for performing the tasks accurately.",
        B1: "The virtual guides (e.g., paths, outlines) appeared clear and sharp.",
        B2: "I was able to comfortably focus on both the virtual guides and the physical task objects at the same time.",
        B3: "I perceived the virtual guides as stable and correctly positioned over the physical world.",
        B4: "The virtual guides made it easy to judge the depth and position of targets.",
        B5: "The virtual content occluding my view of the tool/hand did not significantly disrupt my performance.",
        B6: "The overall visual display (brightness, resolution, field of view) was satisfactory for performing the tasks.",
        C1: "Using this system for the duration of the tasks caused significant eye strain or fatigue.",
        C2: "I experienced feelings of dizziness, headache, or nausea while using this system.",
        C3: "I did not perceive any distracting blur or double vision.",
        C4: "The headset was physically comfortable to wear during the tasks.",
        D1: "I felt frustrated or annoyed while performing the tasks with this system.",
        D2: "Overall, I was satisfied with this guidance system."
    };

    const getMethodFromCond = (cond) => {
        const lower = cond.toLowerCase();
        if (lower.includes('hololens') || lower.includes('ost')) return 'HoloLens2';
        if (lower.includes('quest') || lower.includes('vst')) return 'Quest3';
        if (lower.includes('screen')) return 'Screen';
        return 'Screen';
    };

    const isReverseScored = (key) => ['A4', 'C1', 'C2', 'D1'].includes(key);

    const getScoreColor = (key, val, type = 'pcueq') => {
        if (val === undefined || val === '-' || val === '') return '#4a5568'; // Darker gray default
        const num = parseFloat(val);
        if (isNaN(num)) return '#4a5568';

        if (type === 'pcueq') {
            const reverse = isReverseScored(key);
            if (num >= 4) return reverse ? '#cc0000' : '#00a36c'; // Darker Red / Dark Green
            if (num <= 2) return reverse ? '#00a36c' : '#cc0000'; // Dark Green / Dark Red
            return '#cc9900'; // Dark Yellow
        }
        return '#4a5568';
    };

    const hasNasa = Object.keys(surveys.nasa_tlx || {}).length > 0;
    const hasPcueq = Object.keys(surveys.pcueq || {}).length > 0;

    return (
        <div className="fadeIn">
            <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', color: '#2d3748', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                Questionnaires & Surveys Overview: <span style={{ color: '#3182ce' }}>P{participantId}</span>
            </h2>

            {/* Pre-Experiment Conditions */}
            <div className="glass-card" style={{ padding: '20px', marginBottom: '30px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h3 style={{ fontSize: '1rem', color: '#2d3748', marginBottom: '15px' }}>Pre-Experiment Demographics</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                    {Object.entries(surveys.pre_experiment || {}).map(([key, value]) => (
                        <div key={key} style={{ background: '#f7fafc', padding: '12px', borderRadius: '8px', border: '1px solid #edf2f7' }}>
                            <span style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{key.replace(/_/g, ' ')}</span>
                            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#3182ce', marginTop: '4px' }}>{value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {hasNasa && (
                <div style={{ marginBottom: '40px' }}>
                    <h3 style={{ fontSize: '1.1rem', color: '#2d3748', marginBottom: '15px' }}>NASA Task Load Index (NASA-TLX)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
                        {Object.entries(surveys.nasa_tlx).map(([condition, data]) => {
                            const method = getMethodFromCond(condition);
                            const color = getColor(method, 'Obstructed'); // Uses darker shade
                            return (
                                <div key={condition} className="glass-card" style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderTop: `4px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h4 style={{ color: color, marginBottom: '15px', borderBottom: '1px solid #edf2f7', paddingBottom: '8px' }}>{condition}</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {Object.entries(nasaTexts).map(([key, label]) => (
                                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: '#4a5568' }}>
                                                <span style={{ flex: 1, paddingRight: '10px' }}><strong>{key}:</strong> {label.split(': ')[1]}</span>
                                                <span style={{ fontWeight: 600, color: '#2d3748', background: '#edf2f7', padding: '4px 10px', borderRadius: '4px', minWidth: '40px', textAlign: 'center' }}>
                                                    {data[key] !== undefined ? data[key] : '-'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {hasPcueq && (
                <div style={{ marginBottom: '40px' }}>
                    <h3 style={{ fontSize: '1.1rem', color: '#2d3748', marginBottom: '15px' }}>Post-Condition Usability Assessment (PCUE-Q)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                        {Object.entries(surveys.pcueq).map(([condition, data]) => {
                            const method = getMethodFromCond(condition);
                            const color = getColor(method, 'Obstructed'); // Darker shade
                            return (
                                <div key={condition} className="glass-card" style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderTop: `4px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h4 style={{ color: color, marginBottom: '15px', borderBottom: '1px solid #edf2f7', paddingBottom: '8px' }}>{condition.replace('PCUE-Q for ', '')}</h4>
                                    {Object.entries(pcueqCategories).map(([category, keys]) => (
                                        <div key={category} style={{ marginBottom: '20px' }}>
                                            <h5 style={{ fontSize: '0.85rem', color: color, marginBottom: '10px', borderBottom: `1px solid ${color}22`, paddingBottom: '4px' }}>{category}</h5>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {keys.map(key => {
                                                    const label = pcueqTexts[key];
                                                    const val = data[key];
                                                    const scoreColor = getScoreColor(key, val);
                                                    const hasValue = val !== undefined && val !== '';
                                                    return (
                                                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#4a5568' }}>
                                                            <span style={{ flex: 1, paddingRight: '15px' }}><strong>{key}.</strong> {label}</span>
                                                            <span style={{ 
                                                                fontWeight: 600, 
                                                                color: hasValue ? scoreColor : '#718096', 
                                                                background: hasValue ? `${scoreColor}11` : '#f7fafc', 
                                                                padding: '4px 10px', 
                                                                borderRadius: '4px', 
                                                                minWidth: '35px', 
                                                                textAlign: 'center',
                                                                border: hasValue ? `1px solid ${scoreColor}44` : '1px solid #e2e8f0'
                                                            }}>
                                                                {hasValue ? val : '-'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {Object.keys(surveys.final_preference || {}).length > 0 && (
                <div className="glass-card" style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ fontSize: '1rem', color: '#2d3748', marginBottom: '15px' }}>Final System Preferences</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {Object.entries(surveys.final_preference).map(([key, value]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f7fafc', borderRadius: '6px', border: '1px solid #edf2f7' }}>
                                <span style={{ textTransform: 'capitalize', color: '#4a5568', fontSize: '0.85rem' }}>{key.replace(/_/g, ' ')}</span>
                                <span style={{ fontWeight: 600, color: '#3182ce' }}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SurveyAnalytics;
