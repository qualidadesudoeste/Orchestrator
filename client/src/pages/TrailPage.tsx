import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trailLevels, totalTrailTopics, typeLabels, typeColors, type TrailTopic } from "@/data/trailData";
import { CheckCircle2, Circle, Clock, ExternalLink, ChevronDown, ChevronUp, BookOpen, Award, Wrench, FlaskConical } from "lucide-react";
import { toast } from "sonner";

const typeIcons: Record<TrailTopic["type"], React.ReactNode> = {
  teoria: <BookOpen size={12} />,
  pratica: <FlaskConical size={12} />,
  ferramenta: <Wrench size={12} />,
  certificacao: <Award size={12} />,
};

export default function TrailPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: progressData, isLoading } = trpc.trail.myProgress.useQuery();
  const saveMutation = trpc.trail.saveProgress.useMutation({
    onSuccess: () => utils.trail.myProgress.invalidate(),
  });

  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carregar progresso salvo
  useEffect(() => {
    if (progressData?.completedTopics) {
      try {
        const parsed = JSON.parse(progressData.completedTopics);
        if (Array.isArray(parsed)) setCompletedTopics(new Set(parsed));
      } catch { /* ignore */ }
    }
  }, [progressData]);

  const toggleTopic = (topicId: string) => {
    setCompletedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);

      // Auto-save com debounce
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveMutation.mutate({ completedTopics: Array.from(next) });
      }, 800);

      return next;
    });
  };

  const toggleExpand = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const totalCompleted = completedTopics.size;
  const globalPercent = totalTrailTopics > 0 ? Math.round((totalCompleted / totalTrailTopics) * 100) : 0;

  return (
    <AppLayout>
      <div style={{ padding: "2rem", maxWidth: "900px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                Trilha do Conhecimento QA
              </h1>
              <p style={{ color: "#64748b", marginTop: "0.25rem", fontSize: "0.95rem" }}>
                Analista de Qualidade e Teste de Software — 4 níveis progressivos
              </p>
            </div>
            <div style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "0.75rem 1.25rem",
              textAlign: "center",
              minWidth: "140px",
            }}>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: globalPercent === 100 ? "#059669" : "#2563eb", lineHeight: 1 }}>
                {globalPercent}%
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>
                {totalCompleted}/{totalTrailTopics} tópicos
              </div>
            </div>
          </div>

          {/* Barra de progresso global */}
          <div style={{ marginTop: "1rem", background: "#e2e8f0", borderRadius: "999px", height: "10px", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${globalPercent}%`,
              background: globalPercent === 100 ? "#059669" : "linear-gradient(90deg, #2563eb, #7c3aed)",
              borderRadius: "999px",
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>

        {/* Níveis */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Carregando progresso...</div>
        ) : (
          trailLevels.map((level) => {
            const levelCompleted = level.topics.filter(t => completedTopics.has(t.id)).length;
            const levelPercent = Math.round((levelCompleted / level.topics.length) * 100);

            return (
              <div key={level.id} style={{
                marginBottom: "2rem",
                border: `2px solid ${level.borderColor}`,
                borderRadius: "16px",
                overflow: "hidden",
                background: "#fff",
              }}>
                {/* Header do nível */}
                <div style={{
                  background: level.bgColor,
                  padding: "1.25rem 1.5rem",
                  borderBottom: `1px solid ${level.borderColor}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "1.75rem" }}>{level.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#0f172a" }}>{level.title}</div>
                        <div style={{ fontSize: "0.85rem", color: "#64748b" }}>{level.subtitle}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                        {levelCompleted}/{level.topics.length} tópicos
                      </div>
                      <div style={{
                        background: levelPercent === 100 ? "#059669" : level.color,
                        color: "#fff",
                        borderRadius: "999px",
                        padding: "0.25rem 0.75rem",
                        fontSize: "0.875rem",
                        fontWeight: 700,
                        minWidth: "52px",
                        textAlign: "center",
                      }}>
                        {levelPercent}%
                      </div>
                    </div>
                  </div>
                  {/* Barra do nível */}
                  <div style={{ marginTop: "0.75rem", background: "#e2e8f0", borderRadius: "999px", height: "6px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${levelPercent}%`,
                      background: levelPercent === 100 ? "#059669" : level.color,
                      borderRadius: "999px",
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                </div>

                {/* Tópicos */}
                <div style={{ padding: "0.5rem 0" }}>
                  {level.topics.map((topic, idx) => {
                    const done = completedTopics.has(topic.id);
                    const expanded = expandedTopics.has(topic.id);
                    const hasDetails = topic.description || topic.resources?.length || topic.tags?.length;

                    return (
                      <div key={topic.id} style={{
                        borderBottom: idx < level.topics.length - 1 ? "1px solid #f1f5f9" : "none",
                        transition: "background 0.15s",
                        background: done ? "#f0fdf4" : "transparent",
                      }}>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.875rem 1.5rem",
                          cursor: "pointer",
                        }}
                          onClick={() => toggleTopic(topic.id)}
                        >
                          {/* Checkbox */}
                          <div style={{ flexShrink: 0, color: done ? "#059669" : "#cbd5e1" }}>
                            {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                          </div>

                          {/* Conteúdo */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                              <span style={{
                                fontWeight: 600,
                                fontSize: "0.95rem",
                                color: done ? "#059669" : "#0f172a",
                                textDecoration: done ? "line-through" : "none",
                              }}>
                                {topic.title}
                              </span>
                              {/* Badge tipo */}
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                background: typeColors[topic.type] + "18",
                                color: typeColors[topic.type],
                                border: `1px solid ${typeColors[topic.type]}40`,
                                borderRadius: "999px",
                                padding: "1px 8px",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                              }}>
                                {typeIcons[topic.type]}
                                {typeLabels[topic.type]}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.2rem" }}>
                              <Clock size={12} style={{ color: "#94a3b8" }} />
                              <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>~{topic.estimatedHours}h estimadas</span>
                            </div>
                          </div>

                          {/* Botão expandir */}
                          {hasDetails && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleExpand(topic.id); }}
                              style={{
                                background: "none",
                                border: "1px solid #e2e8f0",
                                borderRadius: "6px",
                                padding: "4px 8px",
                                cursor: "pointer",
                                color: "#64748b",
                                display: "flex",
                                alignItems: "center",
                                flexShrink: 0,
                              }}
                            >
                              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                        </div>

                        {/* Detalhes expandidos */}
                        {expanded && (
                          <div style={{
                            padding: "0 1.5rem 1rem 3.5rem",
                            borderTop: "1px solid #f1f5f9",
                            background: "#fafafa",
                          }}>
                            {topic.description && (
                              <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0.75rem 0 0.5rem" }}>
                                {topic.description}
                              </p>
                            )}
                            {topic.tags && topic.tags.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
                                {topic.tags.map(tag => (
                                  <span key={tag} style={{
                                    background: "#f1f5f9",
                                    color: "#64748b",
                                    borderRadius: "999px",
                                    padding: "2px 10px",
                                    fontSize: "0.72rem",
                                    fontWeight: 500,
                                  }}>#{tag}</span>
                                ))}
                              </div>
                            )}
                            {topic.resources && topic.resources.length > 0 && (
                              <div style={{ marginTop: "0.75rem" }}>
                                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#94a3b8", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  Recursos
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                  {topic.resources.map(r => (
                                    <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.4rem",
                                        color: "#2563eb",
                                        fontSize: "0.85rem",
                                        textDecoration: "none",
                                        fontWeight: 500,
                                      }}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <ExternalLink size={13} />
                                      {r.label}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
