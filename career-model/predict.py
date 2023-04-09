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

    # Replace spaces with underscore characters, when applicable. Make lowercase
    for arg in args:
        arg = re.sub(r"[^\w\s]", '', arg.lower())
        arg = re.sub(r"\s+", '_', arg)
        print(arg)

    # Use Pydantic to validate model fields exist
    student_dict = {
        'student_id': id,
        'major': s_major,
        'age': s_age,
        'gender': s_gender,
        'gpa': s_gpa,
        'extra_curricular': s_extra_curricular,
        'num_programming_languages': s_num_programming_languages,
        'num_past_internships': s_num_past_internships,
    }
    student = parse_obj_as(Student, student_dict)

    clf = joblib.load('./model.pkl')
    
    student = student.dict(by_alias=True)
    query = pd.DataFrame(student, index=[0])
    prediction = clf.predict(query) # TODO: Error handling ??

    return { 'good_employee': prediction[0] }
