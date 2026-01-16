import React from 'react';
import { CheckCircle2, Circle, Clock } from 'lucide-react';
import './RoadmapSection.css';

const RoadmapSection: React.FC = () => {
  const roadmapItems = {
    planned: [
      { id: 1, title: 'Mobile App (iOS/Android)', tag: 'Planned' },
      { id: 2, title: 'Community Features', tag: 'Planned' },
      { id: 3, title: 'Teacher/Student Mode', tag: 'Planned' },
    ],
    inProgress: [
      { id: 4, title: 'Advanced Analytics Dashboard', tag: 'In Progress' },
      { id: 5, title: 'Dark Mode Polish', tag: 'In Progress' },
      { id: 6, title: 'Voice Input for Memorization', tag: 'In Progress' },
    ],
    completed: [
      { id: 7, title: 'Visual Mindmapping Engine', tag: 'Live' },
      { id: 8, title: 'Spaced Repetition Algorithm', tag: 'Live' },
      { id: 9, title: 'Mutashabihat Detection', tag: 'Live' },
    ]
  };

  return (
    <section className="roadmap-section">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Product Roadmap</h2>
          <p style={{ color: 'var(--foreground-secondary)' }}>
            See what we're building to help you master the Quran.
          </p>
        </div>

        <div className="roadmap-grid">
          {/* Column 1: Planned */}
          <div className="roadmap-column">
            <div className="column-header">
              <Circle size={20} className="icon-planned" />
              <h3>Planned</h3>
            </div>
            <div className="column-content">
              {roadmapItems.planned.map(item => (
                <div key={item.id} className="roadmap-card">
                  <span className="status-pill planned">Planned</span>
                  <h4>{item.title}</h4>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: In Progress */}
          <div className="roadmap-column">
            <div className="column-header">
              <Clock size={20} className="icon-progress" />
              <h3>In Progress</h3>
            </div>
            <div className="column-content">
              {roadmapItems.inProgress.map(item => (
                <div key={item.id} className="roadmap-card">
                  <span className="status-pill progress">In Progress</span>
                  <h4>{item.title}</h4>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Completed */}
          <div className="roadmap-column">
            <div className="column-header">
              <CheckCircle2 size={20} className="icon-completed" />
              <h3>Completed</h3>
            </div>
            <div className="column-content">
              {roadmapItems.completed.map(item => (
                <div key={item.id} className="roadmap-card">
                  <span className="status-pill completed">Released</span>
                  <h4>{item.title}</h4>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoadmapSection;
