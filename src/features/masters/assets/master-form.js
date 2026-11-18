const form = document.querySelector('.master-form');
const status = form.querySelector('output');

function checkFields() {
  const invalidFields = Array.from(form.elements).filter(control => control.willValidate && !control.validity.valid);
  for (const field of invalidFields) field.setAttribute('aria-invalid', 'true');
  const first = invalidFields[0];
  if (!first) {
    status.textContent = 'All editable fields passed the preview checks.';
    return;
  }
  status.textContent = invalidFields.length === 1 ? '1 field needs attention.' : `${invalidFields.length} fields need attention.`;
  first.focus();
  first.reportValidity();
}

form.querySelector('[data-check-fields]').addEventListener('click', checkFields);
form.addEventListener('submit', event => {
  event.preventDefault();
  checkFields();
});
form.addEventListener('input', event => {
  if (event.target.validity?.valid) event.target.removeAttribute('aria-invalid');
  status.textContent = '';
});
