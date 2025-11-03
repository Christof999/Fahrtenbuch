// Login-Funktionalität
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    // Prüfen ob bereits eingeloggt
    if (sessionStorage.getItem('loggedIn') === 'true') {
        window.location.href = 'main.html';
        return;
    }

    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Credentials prüfen
        if (username === 'Thomas' && password === '1971') {
            // Login erfolgreich
            sessionStorage.setItem('loggedIn', 'true');
            sessionStorage.setItem('username', username);
            window.location.href = 'main.html';
        } else {
            // Fehler anzeigen
            errorMessage.textContent = 'Falscher Benutzername oder Passwort';
            errorMessage.classList.add('show');
        }
    });
});

