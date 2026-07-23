document.addEventListener("DOMContentLoaded", () => {
    document.cookie = `last_view_date=${new Date()}`;
    console.log(`last_view_date=${new Date()}`);
});



const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('open');
    navLinks.classList.toggle('open');
});

document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        navToggle.classList.remove('open');
        navLinks.classList.remove('open');
    });
});

document.querySelectorAll('.dropdown > a').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            e.preventDefault();
            trigger.parentElement.classList.toggle('open');
        }
    });
});
