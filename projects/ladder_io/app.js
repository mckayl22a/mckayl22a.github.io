const PROXY_BACKEND = 'https://website-gebx.onrender.com';

document.getElementById('inputForm').addEventListener('submit', function (e) {
    e.preventDefault();
    let url = document.getElementById('inputField').value;
    if (url.indexOf('http') === -1) {
        url = 'https://' + url;
    }
    window.open(PROXY_BACKEND + '/ascend/proxy/' + url, '_blank');
    return false;
});
