/**
 * spec-compiler: converts a ProjectSpec row into a formatted system-prompt fragment.
 * Pure utility — no side effects, no DB access.
 */

export interface OntologyEntry {
  term: string
  definition: string
  canonical_name: string
}

export interface ConstraintEntry {
  rule: string
  reason: string
}

export interface ProjectSpec {
  id: string
  name: string
  description: string | null
  ontologyJson: string | null
  contracts: string | null
  constraintsJson: string | null
  architecture: string | null
  context: string | null
  linkedProjectId: string | null
  createdAt: number
  updatedAt: number
}

export function compileSpecToPrompt(spec: ProjectSpec): string {
  const lines: string[] = []

  lines.push(`# Project Spec: ${spec.name}`)

  if (spec.description) {
    lines.push(`\n**Description:** ${spec.description}`)
  }

  if (spec.context) {
    lines.push(`\n## Business Context\n${spec.context}`)
  }

  if (spec.ontologyJson) {
    try {
      const ontology = JSON.parse(spec.ontologyJson) as OntologyEntry[]
      if (Array.isArray(ontology) && ontology.length > 0) {
        lines.push(`\n## Domain Ontology`)
        for (const entry of ontology) {
          const canonical = entry.canonical_name ? ` (\`${entry.canonical_name}\`)` : ""
          lines.push(`- **${entry.term}**${canonical}: ${entry.definition}`)
        }
      }
    } catch { /* malformed JSON — skip */ }
  }

  if (spec.architecture) {
    lines.push(`\n## Architecture\n\`\`\`mermaid\n${spec.architecture}\n\`\`\``)
  }

  if (spec.contracts) {
    lines.push(`\n## Data Contracts\n\`\`\`typescript\n${spec.contracts}\n\`\`\``)
  }

  if (spec.constraintsJson) {
    try {
      const constraints = JSON.parse(spec.constraintsJson) as ConstraintEntry[]
      if (Array.isArray(constraints) && constraints.length > 0) {
        lines.push(`\n## Golden Rules (Inviolable Constraints)`)
        constraints.forEach((c, i) => {
          lines.push(`${i + 1}. **${c.rule}** — ${c.reason}`)
        })
      }
    } catch { /* malformed JSON — skip */ }
  }

  return lines.join("\n")
}
