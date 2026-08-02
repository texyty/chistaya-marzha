const config = window.BACKEND_CONFIG || {};
const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const client = configured ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
let signup = false;

const form = document.querySelector('#auth-form');
const notice = document.querySelector('#auth-notice');
const nameField = document.querySelector('#display-name');

function message(text, type = 'info') {
  notice.hidden = false;
  notice.textContent = text;
  notice.className = `auth-notice ${type}`;
}

function mode() {
  document.querySelector('#auth-title').textContent = signup ? 'Создать аккаунт' : 'Войти';
  document.querySelector('#auth-subtitle').textContent = signup
    ? 'Получите 14 дней полного доступа бесплатно.'
    : 'Продолжите работу со своими магазинами.';
  document.querySelector('#auth-submit').textContent = signup ? 'Создать аккаунт' : 'Войти';
  document.querySelector('#switch-auth').textContent = signup
    ? 'Уже есть аккаунт? Войти'
    : 'Нет аккаунта? Зарегистрироваться';
  nameField.parentElement.hidden = !signup;
  nameField.parentElement.style.display = signup ? 'grid' : 'none';
  document.querySelector('#password').autocomplete = signup ? 'new-password' : 'current-password';
}

document.querySelector('#switch-auth').addEventListener('click', () => {
  signup = !signup;
  notice.hidden = true;
  mode();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!configured) {
    message('Сервер личного кабинета ещё не подключён.', 'warning');
    return;
  }

  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  const button = document.querySelector('#auth-submit');
  button.disabled = true;
  button.textContent = 'Подождите…';

  try {
    if (signup) {
      const emailRedirectTo = new URL('account.html', window.location.href).href;
      const { error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: { display_name: nameField.value.trim() }
        }
      });
      if (error) throw error;
      message('Проверьте почту и подтвердите регистрацию.', 'success');
    } else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      location.href = 'account.html';
    }
  } catch (error) {
    message(error.message || 'Не удалось выполнить запрос.', 'error');
  } finally {
    button.disabled = false;
    mode();
  }
});

mode();
