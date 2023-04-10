from fastapi import FastAPI, HTTPException
import joblib
import pandas as pd
from pydantic import BaseModel, Field
from pydantic.tools import parse_obj_as
import re
import requests

# Pydantic Models
class Student(BaseModel):
    student_id: str = Field(alias="Student ID")
    gender: str = Field(alias="Gender")
    age: str = Field(alias="Age")
    major: str = Field(alias="Major")
    gpa: str = Field(alias="GPA")
    extra_curricular: str = Field(alias="Extra Curricular")
    num_programming_languages: str = Field(alias="Num Programming Languages")
    num_past_internships: str = Field(alias="Num Past Internships")

    class Config:
        allow_population_by_field_name = True

class PredictionResult(BaseModel):
    good_employee: int

app = FastAPI()

@app.get("/")
def read_root():
    return {"Hello": "World"}

# Main Functionality
@app.get("/prediction/{id}/{s_major}/{s_age}/{s_gender}/{s_gpa}/{s_extra_curricular}/{s_num_programming_languages}/{s_num_past_internships}")
def predict(id, s_major, s_age, s_gender, s_gpa, s_extra_curricular, s_num_programming_languages, s_num_past_internships):
    '''
    Returns a prediction on whether the student will be a good employee
    based on given parameters by using the ML model

    Parameters
    ----------
    student : dict
        A dictionary that contains all fields in Student
    
    Returns
    -------
    dict
        A dictionary satisfying type PredictionResult, contains a single field
        'good_employee' which is either 1 (will be a good employee) or 0 (will
        not be a good employee)
    '''
    keys = [
        'student_id',
        'major',
        'age',
        'gender',
        'gpa',
        'extra_curricular',
        'num_programming_languages',
        'num_past_internships',
    ]
    args = [
        id,
        s_major,
        s_age,
        s_gender,
        s_gpa,
        s_extra_curricular,
        s_num_programming_languages,
        s_num_past_internships,
    ]

    if any(arg is None for arg in args):
        raise HTTPException(status_code=404, detail="Missing student field")

    # Replace underscore with space characters, when applicable. Make title case
    newargs = []
    for i in range(len(args)):
        arg = args[i]
        arg = arg.replace('_', ' ')
        if i != 0:
            arg = arg.title()
        # Reformat majors
        if i == 1:
            act_split = arg.split(' ')
            if "And" in act_split:
                idx = act_split.index("And")
                act_split[idx] = act_split[idx].lower()
                arg = ' '.join(act_split)
        # Reformat GPA from '#?#' -> '#.#'
        if i == 4:
            arg = arg.replace('?', '.')
        # Reformat student's extracurriculars
        if i == 5:
            act_split = arg.split(' ')
            if act_split[0].lower() == 'mens':
                act_split[0] = 'Men\'s'
            if "Of" in act_split:
                idx = act_split.index("Of")
                act_split[idx] = act_split[idx].lower()
            if "In" in act_split:
                idx = act_split.index("In")
                act_split[idx] = act_split[idx].lower()
            if "Cs" in act_split:
                idx = act_split.index("Cs")
                act_split[idx] = act_split[idx].upper()
            arg = ' '.join(act_split)
        newargs.append(arg)

    # Use Pydantic to validate model fields exist
    student_dict = {}
    for i in range(len(keys)):
        student_dict[keys[i]] = newargs[i]
    student = parse_obj_as(Student, student_dict)

    clf = joblib.load('./model.pkl')
    
    student = student.dict(by_alias=True)
    query = pd.DataFrame(student, index=[0])
    prediction = clf.predict(query) # TODO: Error handling ??

    return { 'good_employee': prediction[0] }
