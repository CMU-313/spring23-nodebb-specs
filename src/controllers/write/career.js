'use strict';

const helpers = require('../helpers');
const user = require('../../user');
const db = require('../../database');
const request = require('request');
const Career = module.exports;

Career.register = async (req, res) => {
    const userData = req.body;
    try {
        console.log("hi")
        const userCareerData = {
            student_id: userData.student_id,
            major: userData.major,
            age: userData.age,
            gender: userData.gender,
            gpa: userData.gpa,
            extra_curricular: userData.extra_curricular,
            num_programming_languages: userData.num_programming_languages,
            num_past_internships: userData.num_past_internships,
        };
        const url = "http://0.0.0.0:8080/prediction"
        console.log(url)
        
        // Send POST request with userCareerData as JSON object
        try {
            const config = {
                method: 'POST',
                body: JSON.stringify(userCareerData)
            }
            const response = await fetch(url, config)
            if (response.ok) {
                console.log(response)
            }
        } catch (error) {
            console.log("Could not send successful HTTPS request")
        }

        // userCareerData.prediction = Math.round(Math.random()); // TODO: Change this line to do call and retrieve actual candidate success prediction from the model instead of using a random number
        await user.setCareerData(req.uid, userCareerData);
        db.sortedSetAdd('users:career', req.uid, req.uid);
        res.json({});
    } catch (err) {
        console.log(err);
        helpers.noScriptErrors(req, res, err.message, 400);
    }
};
