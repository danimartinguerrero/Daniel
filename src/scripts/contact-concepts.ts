const email = 'nicomg60@gmail.com';
const mailto = (subject: string, body?: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;

const topicMail = document.querySelector<HTMLAnchorElement>('[data-topic-mail]');
const chatPreview = document.querySelector<HTMLElement>('[data-chat-preview]');
const chatButtons = document.querySelectorAll<HTMLButtonElement>('[data-chat]');
chatButtons.forEach(button => button.addEventListener('click', () => {
  chatButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  if (chatPreview) chatPreview.textContent = button.dataset.chat ?? '';
  if (topicMail) topicMail.href = mailto(button.dataset.subject ?? 'Hello Nicolás');
}));
if (topicMail) topicMail.href = mailto('An idea to build together');

const postcard = document.querySelector<HTMLButtonElement>('[data-postcard]');
postcard?.addEventListener('click', () => {
  const flipped = postcard.getAttribute('aria-pressed') !== 'true';
  postcard.setAttribute('aria-pressed', String(flipped));
  postcard.setAttribute('aria-label', flipped ? 'Turn the postcard back to the front' : 'Turn the postcard over to see contact details');
  postcard.querySelector('[data-card-front]')?.setAttribute('aria-hidden', String(flipped));
  postcard.querySelector('[data-card-back]')?.setAttribute('aria-hidden', String(!flipped));
});

const topics = {
  physics: { symbol: 'ψ', title: 'Big questions.', copy: 'Let’s compare notes on how things work.', subject: 'A physics conversation' },
  software: { symbol: '</>', title: 'Useful things.', copy: 'A problem to solve. Something to build.', subject: 'Let’s build something' },
  ideas: { symbol: '✳', title: 'What if…?', copy: 'The best starting point is a curious question.', subject: 'I have an idea' },
};
const orbitButtons = document.querySelectorAll<HTMLButtonElement>('[data-orbit]');
orbitButtons.forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.orbit as keyof typeof topics;
  const topic = topics[key];
  if (!topic) return;
  orbitButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  const title = document.querySelector('[data-orbit-title]');
  const copy = document.querySelector('[data-orbit-copy]');
  const symbol = document.querySelector('[data-orbit-symbol]');
  const link = document.querySelector<HTMLAnchorElement>('[data-orbit-mail]');
  if (title) title.textContent = topic.title;
  if (copy) copy.textContent = topic.copy;
  if (symbol) symbol.textContent = topic.symbol;
  if (link) link.href = mailto(topic.subject);
}));

document.querySelector<HTMLFormElement>('[data-compose]')?.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const data = new FormData(form);
  window.location.href = mailto(String(data.get('subject') ?? ''), String(data.get('body') ?? ''));
});

const copyButton = document.querySelector<HTMLButtonElement>('[data-copy]');
copyButton?.addEventListener('click', async () => {
  const status = document.querySelector<HTMLElement>('[data-copy-status]');
  try {
    await navigator.clipboard.writeText(email);
    copyButton.textContent = 'Copied ✓';
    if (status) status.textContent = 'Email address copied.';
  } catch {
    if (status) status.textContent = 'Could not copy. Select the email address or use the email link.';
    copyButton.textContent = 'Copy unavailable';
  }
});
