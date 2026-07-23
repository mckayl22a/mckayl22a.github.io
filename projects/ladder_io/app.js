document.getElementById('inputForm').addEventListener('submit', function (e) {
    e.preventDefault();
    let url = document.getElementById('inputField').value;
    if (url.indexOf('http') === -1) {
        url = 'https://' + url;
    }
    window.location.href = '/' + url;
    return false;
});
