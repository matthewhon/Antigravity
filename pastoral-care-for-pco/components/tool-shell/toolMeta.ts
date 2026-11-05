import {
  Mail, MessageSquareText, MessagesSquare, UserMinus, Newspaper, FormInput, Vote,
  StickyNote, AppWindow, QrCode, Workflow, Sparkles, FolderOpen,
  type LucideIcon,
} from 'lucide-react';

// ── Tool registry ────────────────────────────────────────────────────────────
// Single source of truth for every tool's name, one-line description, icon and
// category. Headers, the nav menu and (later) the Tools launchpad all read from
// here so a tool looks the same everywhere it appears.

export type ToolCategory = 'communicate' | 'create' | 'automate' | 'library';

export type ToolId =
  | 'emails' | 'sms' | 'team-chat' | 'unsubscribers'
  | 'bulletin' | 'forms' | 'polls' | 'notes' | 'website' | 'qrcodes'
  | 'workflows' | 'church-helper'
  | 'files';

export interface ToolMeta {
  id: ToolId;
  label: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  /** App view key used by navigation (see App.tsx viewToPath). */
  view: string;
}

export const TOOL_META: Record<ToolId, ToolMeta> = {
  // Communicate
  emails:          { id: 'emails',        label: 'Emails',        icon: Mail,              category: 'communicate', view: 'tools-emails',        description: 'Create and send emails to your Planning Center audience' },
  sms:             { id: 'sms',           label: 'SMS',           icon: MessageSquareText, category: 'communicate', view: 'tools-sms-inbox',     description: 'Two-way texting, broadcasts and keyword replies' },
  'team-chat':     { id: 'team-chat',     label: 'Team Chat',     icon: MessagesSquare,    category: 'communicate', view: 'tools-team-chat',     description: 'Internal channels for your staff and volunteers' },
  unsubscribers:   { id: 'unsubscribers', label: 'Unsubscribers', icon: UserMinus,         category: 'communicate', view: 'tools-unsubscribers', description: 'People who opted out are automatically excluded from future sends' },
  // Create & publish
  bulletin:        { id: 'bulletin',      label: 'Bulletins',     icon: Newspaper,         category: 'create',      view: 'tools-bulletin',      description: 'Publish mobile-friendly digital bulletins for Sunday' },
  forms:           { id: 'forms',         label: 'Forms',         icon: FormInput,         category: 'create',      view: 'tools-forms',         description: 'Visitor cards and connect forms that sync to Planning Center' },
  polls:           { id: 'polls',         label: 'Polls',         icon: Vote,              category: 'create',      view: 'tools-polls',         description: 'Send a link to anyone — no login required' },
  notes:           { id: 'notes',         label: 'Notes',         icon: StickyNote,        category: 'create',      view: 'tools-notes',         description: 'Create shareable notes and send public links via SMS' },
  website:         { id: 'website',       label: 'Website',       icon: AppWindow,         category: 'create',      view: 'tools-website',       description: 'Embeddable widgets for your church website' },
  qrcodes:         { id: 'qrcodes',       label: 'QR Codes',      icon: QrCode,            category: 'create',      view: 'tools-qrcodes',       description: 'Generate and track QR codes' },
  // Automate
  workflows:       { id: 'workflows',     label: 'Workflows',     icon: Workflow,          category: 'automate',    view: 'tools-workflows',     description: 'Automated message sequences triggered by people and events' },
  'church-helper': { id: 'church-helper', label: 'Church Helper', icon: Sparkles,          category: 'automate',    view: 'tools-church-helper', description: 'AI-assisted outreach campaigns and conversations' },
  // Library
  files:           { id: 'files',         label: 'Files',         icon: FolderOpen,        category: 'library',     view: 'tools-files',         description: 'Images and documents shared across your tools' },
};

/**
 * Category accent classes. Kept as literal strings so Tailwind can detect them.
 * Colors come from the `--color-tool-*` tokens in index.css.
 */
export const CATEGORY_STYLES: Record<ToolCategory, { label: string; tile: string; text: string }> = {
  communicate: {
    label: 'Communicate',
    tile: 'bg-tool-communicate/10 text-tool-communicate ring-tool-communicate/20 dark:bg-tool-communicate-soft/15 dark:text-tool-communicate-soft dark:ring-tool-communicate-soft/25',
    text: 'text-tool-communicate dark:text-tool-communicate-soft',
  },
  create: {
    label: 'Create & Publish',
    tile: 'bg-tool-create/10 text-tool-create ring-tool-create/20 dark:bg-tool-create-soft/15 dark:text-tool-create-soft dark:ring-tool-create-soft/25',
    text: 'text-tool-create dark:text-tool-create-soft',
  },
  automate: {
    label: 'Automate',
    tile: 'bg-tool-automate/10 text-tool-automate ring-tool-automate/20 dark:bg-tool-automate-soft/15 dark:text-tool-automate-soft dark:ring-tool-automate-soft/25',
    text: 'text-tool-automate dark:text-tool-automate-soft',
  },
  library: {
    label: 'Library',
    tile: 'bg-tool-library/10 text-tool-library ring-tool-library/20 dark:bg-tool-library-soft/15 dark:text-tool-library-soft dark:ring-tool-library-soft/25',
    text: 'text-tool-library dark:text-tool-library-soft',
  },
};
