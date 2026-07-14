const DB_KEY = "users";
const SESSION_KEY = "session";

const user = localStorage.getItem(SESSION_KEY);

if(!user){

    window.location = "index.html";

}

const database =
JSON.parse(localStorage.getItem(DB_KEY));

const currentUser =
database[user];

document.getElementById("welcomeText").textContent =
"Welcome, " + user;

document.getElementById("projectCount").textContent =
currentUser.projects.length;

document.getElementById("taskCount").textContent =
currentUser.tasks.length;

let completed = 0;

currentUser.tasks.forEach(task=>{

    if(task.status=="Done")

        completed++;

});

document.getElementById("doneCount").textContent =
completed;

const container =
document.getElementById("projects");

currentUser.projects.forEach(project=>{

    const div =
    document.createElement("div");

    div.className="project";

    div.innerHTML=`
        <h3>${project.name}</h3>
    `;

    container.appendChild(div);

});

document.getElementById("logout").onclick=()=>{

    localStorage.removeItem(SESSION_KEY);

    window.location="index.html";

};