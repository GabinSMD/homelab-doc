const {normalize} = require('./search.cjs');

function filterServices(services, {query = '', host = 'all'} = {}) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return services.filter((service) => (host === 'all' || service.hosts.includes(host)) && terms.every((term) => normalize(`${service.name} ${service.role} ${service.hosts.join(' ')}`).includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

module.exports = {filterServices};
