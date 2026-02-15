import Handlebars from 'handlebars';

/**
 * Compile a Handlebars template string with the given context.
 * Use in reply flow: compile(templateContent, { customer: { name, email }, ticket: { subject }, agent: { name } }).
 */
export function compileTemplate(
  content: string,
  context: Record<string, unknown> = {}
): string {
  try {
    const template = Handlebars.compile(content, { noEscape: true });
    return template(context);
  } catch {
    return content;
  }
}

/**
 * Example context for preview and for actual reply.
 * Use these variable names in templates, e.g. {{customer.name}}, {{ticket.subject}}.
 */
export const TEMPLATE_VARIABLES = {
  customer: {
    name: 'Customer name',
    email: 'Customer email',
    company: 'Customer company',
  },
  ticket: {
    subject: 'Ticket subject',
    ticket_number: 'e.g. TKT-0001',
  },
  agent: {
    name: 'Agent name',
    email: 'Agent email',
  },
} as const;

export const TEMPLATE_VARIABLES_PREVIEW: Record<string, unknown> = {
  customer: { name: 'Jane Doe', email: 'jane@example.com', company: 'Acme Inc.' },
  ticket: { subject: 'Billing question', ticket_number: 'TKT-0042' },
  agent: { name: 'Support Agent', email: 'agent@example.com' },
};
