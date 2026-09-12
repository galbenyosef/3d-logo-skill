import { useState } from 'react'
import { CopyButton } from './CopyButton'

const NPX_COMMAND = 'npx skills add hasuwini77/3d-logo-skill'
const MARKETPLACE_COMMAND = 'claude plugin marketplace add hasuwini77/3d-logo-skill'
const PLUGIN_INSTALL_COMMAND = 'claude plugin install 3d-logo@3d-logo-skill'
const AGENT_PROMPT = 'Make my logo at public/logo.png a 3D spinning coin'
const USAGE_SNIPPET = '<Canvas>\n  <SpinningLogo3D logoPath="/logo.png" />\n</Canvas>'

const TABS = [
  { id: 'npx', label: 'npx' },
  { id: 'claude', label: 'Claude Code' },
] as const

type TabId = (typeof TABS)[number]['id']

export function GetItSection() {
  const [activeTab, setActiveTab] = useState<TabId>('npx')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((t) => t.id === activeTab)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const nextIndex = e.key === 'ArrowRight' ? (index + 1) % TABS.length : (index - 1 + TABS.length) % TABS.length
      const next = TABS[nextIndex]
      setActiveTab(next.id)
      document.getElementById(`install-tab-${next.id}`)?.focus()
    }
  }

  return (
    <section className="get-it" aria-labelledby="get-it-title">
      <h2 id="get-it-title" className="section-title">
        Get it in your project
      </h2>

      <div className="tabs">
        <div className="tablist" role="tablist" aria-label="Install method">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`install-tab-${tab.id}`}
              type="button"
              role="tab"
              className="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`install-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleKeyDown}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          id="install-panel-npx"
          role="tabpanel"
          aria-labelledby="install-tab-npx"
          hidden={activeTab !== 'npx'}
          className="tab-panel"
        >
          <div className="code-row">
            <code className="code-block mono">{NPX_COMMAND}</code>
            <CopyButton text={NPX_COMMAND} label="Copy command" />
          </div>
          <p className="tab-note">Auto-detects any agent that supports the Agent Skills spec — Cursor, Codex, Copilot, Gemini CLI, and 50+ more.</p>
        </div>

        <div
          id="install-panel-claude"
          role="tabpanel"
          aria-labelledby="install-tab-claude"
          hidden={activeTab !== 'claude'}
          className="tab-panel"
        >
          <div className="code-row">
            <code className="code-block mono">{MARKETPLACE_COMMAND}</code>
            <CopyButton text={MARKETPLACE_COMMAND} label="Copy command" />
          </div>
          <div className="code-row">
            <code className="code-block mono">{PLUGIN_INSTALL_COMMAND}</code>
            <CopyButton text={PLUGIN_INSTALL_COMMAND} label="Copy command" />
          </div>
        </div>
      </div>

      <div className="get-it-usage">
        <p className="get-it-label">Then ask your agent:</p>
        <div className="code-row">
          <code className="code-block mono">{AGENT_PROMPT}</code>
          <CopyButton text={AGENT_PROMPT} label="Copy prompt" />
        </div>

        <p className="get-it-label">It generates a component you drop in:</p>
        <pre className="code-block mono code-snippet">{USAGE_SNIPPET}</pre>
      </div>
    </section>
  )
}
