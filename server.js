async function askLLM(message) {
    const response = await fetch("http://127.0.0.1:8080/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messages: [
                {
                    role: "system",
                    content: "Ты являешься AI-системой политической стратегии Mandate. Отвечай исключительно на русском языке."
                },
                {
                    role: "user",
                    content: message
                }
            ],
            max_tokens: 300,
            temperature: 0.7
        })
    });

    const data = await response.json();
    return data.choices[0].message.content;
}

async function main() {
    const answer = await askLLM(
        "1784 год. В парламент внесён закон о повышении налога на землю. Кратко опиши реакцию крупных землевладельцев."
    );

    console.log(answer);
}

main();