import os

css_append = """
/* ---------- UX Upgrades (Gamification & Animations) ---------- */
.fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--accent-yellow);
    color: #000;
    border: none;
    font-size: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px var(--accent-yellow-glow);
    cursor: pointer;
    z-index: 999;
    transition: all var(--transition-normal);
}
.fab:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 25px var(--accent-yellow-glow);
}

.anim-slide-up {
    animation: slideUpAnim 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes slideUpAnim {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.anim-pop-in {
    animation: popInAnim 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes popInAnim {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
}

.badge-rank {
    font-size: 1.5rem;
    margin-right: 4px;
}
.score-tag {
    font-size: 0.75rem;
    background: rgba(250, 204, 21, 0.15);
    color: var(--accent-yellow);
    padding: 2px 8px;
    border-radius: 12px;
    margin-left: 8px;
    font-weight: 700;
}
"""

with open(r"c:\Users\monke\Downloads\walt manager\style.css", "a", encoding="utf-8") as f:
    f.write(css_append)
