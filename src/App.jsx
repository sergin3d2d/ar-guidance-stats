import React, { useState, useMemo } from 'react';
import {
  Activity,
  Download,
  BarChart3
} from 'lucide-react';
import DataIngest from './components/DataIngest';
import Task1Analytics from './components/Task1Analytics';
import Task2Analytics from './components/Task2Analytics';
import Task3Analytics from './components/Task3Analytics';
import SurveyAnalytics from './components/SurveyAnalytics';
import TaskVariableTable from './components/TaskVariableTable';
import ExportSettingsModal from './components/ExportSettingsModal';

const App = () => {
  const [data, setData] = useState(null);
  const [rawFiles, setRawFiles] = useState([]);
  const [csvFiles, setCsvFiles] = useState([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeTask, setActiveTask] = useState('Task1');
  const [activeCondition, setActiveCondition] = useState('Visible');
  const [activeParticipant, setActiveParticipant] = useState(null);

  const handleDataLoaded = (processedData, raw, csvs) => {
    setData(processedData);
    setRawFiles(raw);
    setCsvFiles(csvs || []);
    const participants = Object.keys(processedData.participants);
    if (participants.length > 0) {
      setActiveParticipant(participants[0]);
    }
  };

  const hasDataForActive = useMemo(() => {
    if (!data || !activeParticipant) return false;
    if (activeTask === 'Questionnaires') {
      return !!data.participants[activeParticipant]?.surveys;
    }
    const taskData = data.participants[activeParticipant]?.[activeTask];
    if (!taskData) return false;
    return Object.values(taskData).some(conditionData => 
      Object.values(conditionData).some(methodData => Object.keys(methodData).length > 0)
    );
  }, [data, activeParticipant, activeTask]);

  return (
    <div>
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Activity size={32} color="#00f2ff" />
          <h1 style={{ fontSize: '1.5rem', margin: 0, letterSpacing: '2px' }}>DATA AGGREGATION TOOL</h1>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {data && (
            <button
              className="btn-primary"
              onClick={() => setExportOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Download size={18} /> Export for analysis…
            </button>
          )}
          <div className="stat-label">ALPHA v1.0.0</div>
        </div>
      </header>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px' }}>

        {!data && <DataIngest onDataLoaded={handleDataLoaded} />}

        {exportOpen && (
          <ExportSettingsModal
            rawFiles={rawFiles}
            csvFiles={csvFiles}
            onClose={() => setExportOpen(false)}
          />
        )}

        {data && (
          <>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '40px', justifyContent: 'center' }}>
              <div className="glass-card" style={{ display: 'flex', gap: '20px', padding: '10px 20px' }}>
                {['Task1', 'Task2', 'Task3', 'Questionnaires'].map(t => (
                  <button
                    key={t}
                    onClick={() => setActiveTask(t)}
                    className="btn-primary"
                    style={{ 
                      background: activeTask === t ? 'var(--secondary)' : 'transparent', 
                      color: activeTask === t ? 'white' : 'var(--text)', 
                      border: activeTask === t ? 'none' : '1px solid var(--glass-border)',
                      opacity: activeTask === t ? 1 : 0.8
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="glass-card" style={{ display: 'flex', gap: '20px', padding: '10px 20px', alignItems: 'center' }}>
                <span className="stat-label">PARTICIPANT:</span>
                <select
                  style={{ background: 'var(--bg-card)', color: 'var(--text)', padding: '8px', border: '1px solid var(--glass-border)', borderRadius: '4px', outline: 'none' }}
                  value={activeParticipant || ''}
                  onChange={(e) => setActiveParticipant(e.target.value)}
                >
                  {Object.keys(data.participants).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <button className="btn-primary" onClick={() => setData(null)} style={{ background: 'var(--accent)' }}>
                Reset Data
              </button>
            </div>

            <div style={{ marginTop: '20px' }}>
              {hasDataForActive ? (
                <>
                  {activeTask === 'Task1' && <Task1Analytics participantData={data.participants[activeParticipant]} participantId={activeParticipant} />}
                  {activeTask === 'Task2' && <Task2Analytics participantData={data.participants[activeParticipant]} participantId={activeParticipant} />}
                  {activeTask === 'Task3' && <Task3Analytics participantData={data.participants[activeParticipant]} participantId={activeParticipant} />}
                  {activeTask === 'Questionnaires' && <SurveyAnalytics participantData={data.participants[activeParticipant]} participantId={activeParticipant} />}
                </>
              ) : (
                <div className="glass-card" style={{ textAlign: 'center', padding: '100px' }}>
                  <BarChart3 size={48} color="var(--text-dim)" style={{ marginBottom: '20px', opacity: 0.5 }} />
                  <h3 style={{ color: 'var(--text-dim)' }}>No data found for {activeTask}.</h3>
                  <p className="stat-label">Please check if the selected folders contain files for this task.</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;
