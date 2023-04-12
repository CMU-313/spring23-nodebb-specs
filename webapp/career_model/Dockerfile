FROM python:3.9

WORKDIR /usr/src/app/NodeBB/webapp/career_model

COPY requirements.txt .

RUN pip install -r requirements.txt

COPY model.pkl .

COPY predict.py .

EXPOSE 8080

CMD ["uvicorn", "predict:app", "--host", "0.0.0.0", "--port", "8080"]