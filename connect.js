const pending = document.querySelector('#pending');
document.querySelector('#ozon-connect').addEventListener('click', () => pending.showModal());
document.querySelector('#pending-close').addEventListener('click', () => pending.close());
