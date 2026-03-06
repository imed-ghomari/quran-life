import React from 'react';
import { CheckCircle2, Circle, Clock, Lightbulb } from 'lucide-react';
import './RoadmapSection.css';

type RoadmapItem = {
  id: number;
  title: string;
  badge?: {
    label: string;
    tone: 'planned' | 'progress' | 'completed';
  };
};

const RoadmapSection: React.FC = () => {
  const roadmapItems: {
    considering: RoadmapItem[];
    planned: RoadmapItem[];
    inProgress: RoadmapItem[];
    launched: RoadmapItem[];
  } = {
    considering: [
      { id: 17, title: 'Prebuilt Similarity Solution Packs' },
      { id: 18, title: 'Optional Mindmaps for Nonlinear Surah Clusters' },
      { id: 19, title: 'Methodology Validation' },
      { id: 20, title: 'Mindmap Version History' },
      { id: 2, title: 'Localization & Translation' },
      { id: 13, title: 'Better Design for Mindmaps' }
    ],
    planned: [
      { id: 12, title: 'Completing Mindmaps (Parts 1-6)' },
      { id: 21, title: 'Defer Similarity by Surah Conditions' },
      {
        id: 16,
        title: 'Conflict-safe mindmap sync (choose between device and cloud versions)'
      }
    ],
    inProgress: [
      { id: 7, title: 'Part 7 Mindmaps Integration (Surah 67-114)' },
      { id: 14, title: 'Community Platform (Discord)' }
    ],
    launched: [
      { id: 10, title: 'Documentation' },
      { id: 8, title: 'Spaced Repetition Algorithm' },
      { id: 9, title: 'Similar Verse Support' },
      {
        id: 15,
        title: 'Offline Mode',
        badge: { label: 'Beta', tone: 'progress' }
      },
      { id: 3, title: 'Audio Mode' }
    ]
  };

  const roadmapStages = [
    {
      key: 'considering',
      title: 'Considering',
      icon: Lightbulb,
      iconClass: 'icon-planned',
      items: roadmapItems.considering
    },
    {
      key: 'planned',
      title: 'Planned',
      icon: Circle,
      iconClass: 'icon-planned',
      items: roadmapItems.planned
    },
    {
      key: 'in-progress',
      title: 'In Progress',
      icon: Clock,
      iconClass: 'icon-progress',
      items: roadmapItems.inProgress
    },
    {
      key: 'launched',
      title: 'Launched',
      icon: CheckCircle2,
      iconClass: 'icon-completed',
      items: roadmapItems.launched
    }
  ] as const;

  return (
    <section id="roadmap" className="roadmap-section">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Product Roadmap</h2>
          <p style={{ color: 'var(--foreground-secondary)' }}>
            See what we're building to help you master the Quran.
          </p>
        </div>

        <div className="roadmap-board">
          {roadmapStages.map(stage => {
            const Icon = stage.icon;
            return (
              <section key={stage.key} className="roadmap-stage">
                <div className="roadmap-stage-header">
                  <div className="roadmap-stage-title">
                    <Icon size={18} className={stage.iconClass} />
                    <h3>{stage.title}</h3>
                  </div>
                  <span className="roadmap-stage-count">{stage.items.length}</span>
                </div>
                <ul className="roadmap-list">
                  {stage.items.map(item => (
                    <li key={item.id} className="roadmap-list-item">
                      <div className="roadmap-item-line">
                        <h4>{item.title}</h4>
                        {item.badge ? (
                          <span className={`status-pill ${item.badge.tone}`}>
                            {item.badge.label}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default RoadmapSection;
