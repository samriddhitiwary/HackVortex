import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import axios from "axios";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const __dirname = path.resolve();

const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 10e6 });

app.use(cors());
app.use(express.json());

app.get('/view', (req, res) => {
  res.sendFile(__dirname + '/display.html');
})

app.post("/ai-autocomplete", async (req, res) => {
  try {
    const { prompt } = req.body;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    // Correct the model name to "gpt-4" instead of "gpt-4o"
    const model = "gpt-4"; // Use the appropriate model name

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",  // Change endpoint to /chat/completions for newer API
      {
        model: model,
        messages: [
          { role: "system", content: "You are a helpful assistant to write good quality Code. Also explain the code but not more than 100 words" },
          { role: "user", content: prompt }
        ],
      },
      {
        headers: { Authorization: `Bearer ${openaiApiKey}` }
      }
    );
    
    res.json({ suggestion: response.data.choices[0].message.content });
  } catch (error) {
    console.error("Error processing AI suggestion:", error); // More detailed error logging
    res.status(500).json({ error: error.message });
  }
});






// Code Execution API
app.post("/run", (req, res) => {
  const { code, language } = req.body;
  let command;

  switch (language) {
    case "javascript":
      command = `node -e "${code.replace(/"/g, '\\"')}"`;
      exec(command, (error, stdout, stderr) => {
        if (error) return res.json({ output: stderr });
        res.json({ output: stdout });
      });
      break;

    case "python":
      command = `python -c "${code.replace(/"/g, '\\"')}"`;
      exec(command, (error, stdout, stderr) => {
        if (error) return res.json({ output: stderr });
        res.json({ output: stdout });
      });
      break;

      case "java": {
        const match = code.match(/public\s+class\s+(\w+)/);
        if (!match) {
          return res.json({ output: "Error: No public class found in Java code." });
        }
        
        const className = match[1]; // Extract class name
        const javaFile = path.join(tempDir, `${className}.java`);
        fs.writeFileSync(javaFile, code);
      
        // Compile Java file
        const compileCommand = `javac ${javaFile}`;
        exec(compileCommand, (compileError, compileStdout, compileStderr) => {
          if (compileError) {
            return res.json({ output: compileStderr || "Compilation failed" });
          }
      
          // Ensure the Java process runs in the correct directory
          const runCommand = `java -cp ${tempDir} ${className}`;
          exec(runCommand, { cwd: tempDir }, (runError, runStdout, runStderr) => {
            if (runError) {
              return res.json({ output: runStderr || "Execution failed" });
            }
            res.json({ output: runStdout.trim() });
          });
        });
        break;
      }
      
      

    case "cpp": {
      const cppFile = path.join(tempDir, "main.cpp");
      fs.writeFileSync(cppFile, code);

      // Compile C++ code
      const compileCommand = `g++ ${cppFile} -o ${tempDir}/main`;
      exec(compileCommand, (compileError, compileStdout, compileStderr) => {
        if (compileError) {
          return res.json({ output: compileStderr });
        }

        // Run the compiled C++ program
        const runCommand = `${tempDir}/main`;
        exec(runCommand, (runError, runStdout, runStderr) => {
          if (runError) {
            return res.json({ output: runStderr });
          }
          res.json({ output: runStdout });
        });
      });
      break;
    }

    default:
      return res.json({ output: "Language not supported yet." });
  }
});


const getInlineSuggestion = async (codeSoFar) => {
  console.log("Fetching AI Suggestion for:", codeSoFar); // Debug log
  try {
    const response = await axios.post("http://localhost:5000/ai-autocomplete", { 
      prompt: `Suggest next(only next one line) line code completion for : ${codeSoFar}` 
    });
    console.log("AI Suggestion Response:", response.data); // Debug log
    const { aiCode } = removeFirstAndLastLine(response.data.suggestion);
    return aiCode;
  } catch (error) {
    console.error("Error fetching inline suggestion:", error);
    return "";
  }
};



// Real-time Collaboration
let users = {};
io.on("connection", (socket) => {
  socket.on("join-message", (roomId) => {
    socket.join(roomId);
    console.log("User joined in a room : " + roomId);
  });

  socket.on("screen-data", (data) => {
    // console.log('I AM INSIDE THE SCREEN-DATA',data);
    data = JSON.parse(data);
    var room = data.room;
    var imgStr = data.image;
    socket.broadcast.to(room).emit('screen-data', imgStr);
  });

  socket.on("mouse-move", (data) => {
    var room = JSON.parse(data).room;
    socket.broadcast.to(room).emit("mouse-move", data);
  });

  socket.on("mouse-click", (data) => {
    var room = JSON.parse(data).room;
    socket.broadcast.to(room).emit("mouse-click", data);
  });

  socket.on("type", (data) => {
    var room = JSON.parse(data).room;
    socket.broadcast.to(room).emit("type", data);
  });

  socket.on("codeChange", (data) => {
    socket.to(users[socket.id]).emit("codeUpdate", data);
  });

  socket.on("joinRoom", (room) => {
    socket.join(room);
    users[socket.id] = room;
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
  });
});

server.listen(5000, () => console.log("Server running on port 5000"));
