const masterGroup = document.querySelector('.master-group');
if (window.matchMedia('(max-width: 480px)').matches && new URLSearchParams(location.search).has('master')) {
  masterGroup.open = false;
}
