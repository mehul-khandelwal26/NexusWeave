//Local storage
const DB_KEY = "users";
const SESSION_KEY = "session";

//to access index.html
const form = document.getElementById("loginForm");
const userin = document.getElementById("email");
const passin = document.getElementById("password");

//to access css
const switchh = document.querySelector(".switch a");
const title = document.querySelector(".login-card h2");
const sub = document.querySelector(".login-card p");
const submit = document.querySelector(".login-btn");

let loginMode = true;

// local storage

function reg(){
    const users = localStorage.getItem(DB_KEY);

    if(!users)
        return {};

    return JSON.parse(users);
}

function sav(users){
    localStorage.setItem(DB_KEY , JSON.stringify(users));
}

function set(email){
    localStorage.setItem(SESSION_KEY, email);
}

function del(){
    localStorage.removeItem(SESSION_KEY);
}

switchh.addEventListener("click", function (e) {

    e.preventDefault();

    loginMode = !loginMode;

    if (loginMode) {

        title.textContent = "Welcome Back";
        submit.textContent = "Login";

        switchh.textContent = "Sign Up";
        switchh.parentElement.firstChild.textContent =
            "Don't have an account? ";

    }

    else {

        title.textContent = "Create Account";
        submit.textContent = "Sign Up";

        switchh.textContent = "Login";
        switchh.parentElement.firstChild.textContent =
            "Already have an account? ";

    }
});

form.addEventListener("submit", function (e) {

    e.preventDefault();

    const email = userin.value.trim();
    const password = passin.value;

    const users = reg();

    if (!loginMode) {

        if (users[email]) {

            alert("User already exists.");
            return;

        }

        users[email] = {

            password: password,

            createdAt: Date.now(),

            projects: [],

            tasks: []

        };

        sav(users);

        set(email);

        alert("Account created successfully!");
        window.location = "dashboard.html";

    }


    const user = users[email];

    if (!user) {

        alert("Account not found.");
        return;

    }

    if (user.password !== password) {

        alert("Incorrect password.");
        return;

    }

    set(email);

    alert("Welcome back!");

    window.location = "dashboard.html";


});

window.addEventListener("load", () => {

    const session = localStorage.getItem(SESSION_KEY);

    if (!session) return;

    console.log("Already Logged In:", session);

    window.location = "dashboard.html";
});
