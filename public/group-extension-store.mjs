import {catalog} from './group-extension-catalog.mjs';

const search = document.querySelector('#extension-search');
const results = document.querySelector('#extension-results');
function render() {
  const query = search.value.trim().toLowerCase();
  const matches = catalog.filter(entry =>
    [entry.name, entry.author, entry.purpose].join(' ').toLowerCase().includes(query));
  results.replaceChildren();
  if (!matches.length) results.textContent = 'No extensions match your search.';
  for (const entry of matches) {
    const card = document.createElement('article');
    const name = document.createElement('h2');
    name.textContent = entry.name;
    const description = document.createElement('p');
    description.textContent = entry.purpose + ' By ' + entry.author + '.';
    card.append(name, description);
    for (const [label, url] of [['Setup guide', entry.guide], ['Downloads', entry.download]]) {
      const link = document.createElement('a');
      link.textContent = label;
      link.href = url;
      card.append(link, document.createTextNode(' '));
    }
    results.append(card);
  }
}
search.addEventListener('input', render);
render();
