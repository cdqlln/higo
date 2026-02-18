from flask import Flask, render_template, request, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timezone
from dateutil import parser as dateparser
import os

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(BASE_DIR, 'higo.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'higo-flight-task-mgmt-2024'

db = SQLAlchemy(app)


# ─── Models ──────────────────────────────────────────────────────────────────

class Flight(db.Model):
    __tablename__ = 'flights'

    id            = db.Column(db.Integer, primary_key=True)
    flight_number = db.Column(db.String(20), nullable=False, unique=True)
    airline       = db.Column(db.String(100), nullable=False)
    origin        = db.Column(db.String(100), nullable=False)
    destination   = db.Column(db.String(100), nullable=False)
    departure_time = db.Column(db.DateTime, nullable=False)
    arrival_time  = db.Column(db.DateTime, nullable=False)
    aircraft_type = db.Column(db.String(50), default='')
    status        = db.Column(db.String(30), default='scheduled')  # scheduled/boarding/departed/arrived/delayed/cancelled
    remarks       = db.Column(db.Text, default='')
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    tasks = db.relationship('Task', backref='flight', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        completed = sum(1 for t in self.tasks if t.status == 'completed')
        return {
            'id':            self.id,
            'flight_number': self.flight_number,
            'airline':       self.airline,
            'origin':        self.origin,
            'destination':   self.destination,
            'departure_time': self.departure_time.isoformat(),
            'arrival_time':  self.arrival_time.isoformat(),
            'aircraft_type': self.aircraft_type,
            'status':        self.status,
            'remarks':       self.remarks,
            'created_at':    self.created_at.isoformat(),
            'task_total':    len(self.tasks),
            'task_completed': completed,
        }


class Task(db.Model):
    __tablename__ = 'tasks'

    id          = db.Column(db.Integer, primary_key=True)
    flight_id   = db.Column(db.Integer, db.ForeignKey('flights.id'), nullable=False)
    title       = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    category    = db.Column(db.String(50), default='general')   # general/safety/catering/maintenance/ground/crew
    priority    = db.Column(db.String(20), default='normal')    # low/normal/high/urgent
    status      = db.Column(db.String(20), default='pending')   # pending/in_progress/completed/cancelled
    assigned_to = db.Column(db.String(100), default='')
    due_time    = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                            onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id':           self.id,
            'flight_id':    self.flight_id,
            'flight_number': self.flight.flight_number if self.flight else '',
            'title':        self.title,
            'description':  self.description,
            'category':     self.category,
            'priority':     self.priority,
            'status':       self.status,
            'assigned_to':  self.assigned_to,
            'due_time':     self.due_time.isoformat() if self.due_time else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at':   self.created_at.isoformat(),
            'updated_at':   self.updated_at.isoformat(),
        }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def parse_dt(s):
    if not s:
        return None
    try:
        return dateparser.parse(s)
    except Exception:
        return None


def seed_demo_data():
    if Flight.query.count() > 0:
        return
    now = datetime.now(timezone.utc)
    flights_data = [
        dict(flight_number='CA1234', airline='中国国际航空', origin='北京(PEK)', destination='上海(PVG)',
             departure_time=datetime(2026, 2, 18, 8, 0), arrival_time=datetime(2026, 2, 18, 10, 30),
             aircraft_type='Boeing 737-800', status='scheduled'),
        dict(flight_number='MU5678', airline='中国东方航空', origin='上海(PVG)', destination='广州(CAN)',
             departure_time=datetime(2026, 2, 18, 12, 0), arrival_time=datetime(2026, 2, 18, 14, 15),
             aircraft_type='Airbus A320', status='boarding'),
        dict(flight_number='CZ3901', airline='中国南方航空', origin='广州(CAN)', destination='成都(CTU)',
             departure_time=datetime(2026, 2, 18, 15, 30), arrival_time=datetime(2026, 2, 18, 17, 45),
             aircraft_type='Boeing 787-9', status='delayed', remarks='因天气原因延误约40分钟'),
        dict(flight_number='HU7654', airline='海南航空', origin='海口(HAK)', destination='北京(PEK)',
             departure_time=datetime(2026, 2, 18, 9, 30), arrival_time=datetime(2026, 2, 18, 13, 0),
             aircraft_type='Airbus A330', status='departed'),
        dict(flight_number='3U2468', airline='四川航空', origin='成都(CTU)', destination='重庆(CKG)',
             departure_time=datetime(2026, 2, 18, 16, 0), arrival_time=datetime(2026, 2, 18, 16, 55),
             aircraft_type='Airbus A319', status='arrived'),
    ]
    for fd in flights_data:
        f = Flight(**fd)
        db.session.add(f)
    db.session.flush()

    tasks_data = [
        # CA1234
        dict(flight_number='CA1234', title='旅客登机确认', category='ground', priority='high', status='pending',
             assigned_to='地面服务组A', description='确认所有旅客登机完毕，核对人数与舱单一致'),
        dict(flight_number='CA1234', title='行李装载检查', category='ground', priority='high', status='completed',
             assigned_to='行李服务组', description='确认行李已全部装载并固定'),
        dict(flight_number='CA1234', title='机组餐食补给', category='catering', priority='normal', status='pending',
             assigned_to='配餐部门', description='为机组人员准备飞行餐食'),
        # MU5678
        dict(flight_number='MU5678', title='安全设备检查', category='safety', priority='urgent', status='in_progress',
             assigned_to='机务组', description='检查氧气面罩、救生衣等安全设备'),
        dict(flight_number='MU5678', title='旅客餐食服务', category='catering', priority='normal', status='pending',
             assigned_to='乘务组', description='准备并发放旅客餐食'),
        # CZ3901
        dict(flight_number='CZ3901', title='延误旅客安抚', category='general', priority='urgent', status='in_progress',
             assigned_to='旅客服务组', description='对延误旅客进行告知和安抚，提供餐食补偿'),
        dict(flight_number='CZ3901', title='飞机维护检查', category='maintenance', priority='high', status='pending',
             assigned_to='机务维修组', description='延误期间对飞机进行例行检查'),
        # HU7654
        dict(flight_number='HU7654', title='飞行计划确认', category='crew', priority='high', status='completed',
             assigned_to='运控中心', description='确认飞行计划、航路、备降机场'),
        # 3U2468
        dict(flight_number='3U2468', title='到港旅客引导', category='ground', priority='normal', status='completed',
             assigned_to='地面服务组B', description='引导到港旅客至行李提取处'),
    ]
    flight_map = {f.flight_number: f.id for f in Flight.query.all()}
    for td in tasks_data:
        fn = td.pop('flight_number')
        t = Task(flight_id=flight_map[fn], **td)
        db.session.add(t)
    db.session.commit()


# ─── Page routes ─────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ─── API: Dashboard ──────────────────────────────────────────────────────────

@app.route('/api/dashboard')
def api_dashboard():
    flights = Flight.query.all()
    tasks   = Task.query.all()
    status_count = {}
    for f in flights:
        status_count[f.status] = status_count.get(f.status, 0) + 1
    priority_count = {}
    task_status_count = {}
    for t in tasks:
        priority_count[t.priority] = priority_count.get(t.priority, 0) + 1
        task_status_count[t.status] = task_status_count.get(t.status, 0) + 1
    urgent_tasks = [t.to_dict() for t in
                    Task.query.filter(Task.priority == 'urgent', Task.status != 'completed',
                                      Task.status != 'cancelled').limit(5).all()]
    return jsonify({
        'flight_total':    len(flights),
        'task_total':      len(tasks),
        'task_pending':    task_status_count.get('pending', 0),
        'task_in_progress': task_status_count.get('in_progress', 0),
        'task_completed':  task_status_count.get('completed', 0),
        'flight_status':   status_count,
        'task_priority':   priority_count,
        'task_status':     task_status_count,
        'urgent_tasks':    urgent_tasks,
    })


# ─── API: Flights ─────────────────────────────────────────────────────────────

@app.route('/api/flights', methods=['GET'])
def list_flights():
    q      = request.args.get('q', '').strip()
    status = request.args.get('status', '').strip()
    query  = Flight.query
    if q:
        like = f'%{q}%'
        query = query.filter(
            db.or_(Flight.flight_number.ilike(like),
                   Flight.airline.ilike(like),
                   Flight.origin.ilike(like),
                   Flight.destination.ilike(like))
        )
    if status:
        query = query.filter(Flight.status == status)
    flights = query.order_by(Flight.departure_time).all()
    return jsonify([f.to_dict() for f in flights])


@app.route('/api/flights/<int:fid>', methods=['GET'])
def get_flight(fid):
    f = Flight.query.get_or_404(fid)
    data = f.to_dict()
    data['tasks'] = [t.to_dict() for t in f.tasks]
    return jsonify(data)


@app.route('/api/flights', methods=['POST'])
def create_flight():
    d = request.get_json(force=True)
    required = ('flight_number', 'airline', 'origin', 'destination', 'departure_time', 'arrival_time')
    for field in required:
        if not d.get(field):
            abort(400, description=f'缺少字段: {field}')
    if Flight.query.filter_by(flight_number=d['flight_number']).first():
        abort(409, description=f"航班号 {d['flight_number']} 已存在")
    f = Flight(
        flight_number = d['flight_number'].upper(),
        airline       = d['airline'],
        origin        = d['origin'],
        destination   = d['destination'],
        departure_time = parse_dt(d['departure_time']),
        arrival_time  = parse_dt(d['arrival_time']),
        aircraft_type = d.get('aircraft_type', ''),
        status        = d.get('status', 'scheduled'),
        remarks       = d.get('remarks', ''),
    )
    db.session.add(f)
    db.session.commit()
    return jsonify(f.to_dict()), 201


@app.route('/api/flights/<int:fid>', methods=['PUT'])
def update_flight(fid):
    f = Flight.query.get_or_404(fid)
    d = request.get_json(force=True)
    if 'flight_number' in d and d['flight_number'] != f.flight_number:
        if Flight.query.filter_by(flight_number=d['flight_number']).first():
            abort(409, description=f"航班号 {d['flight_number']} 已存在")
        f.flight_number = d['flight_number'].upper()
    for field in ('airline', 'origin', 'destination', 'aircraft_type', 'status', 'remarks'):
        if field in d:
            setattr(f, field, d[field])
    if 'departure_time' in d:
        f.departure_time = parse_dt(d['departure_time'])
    if 'arrival_time' in d:
        f.arrival_time = parse_dt(d['arrival_time'])
    db.session.commit()
    return jsonify(f.to_dict())


@app.route('/api/flights/<int:fid>', methods=['DELETE'])
def delete_flight(fid):
    f = Flight.query.get_or_404(fid)
    db.session.delete(f)
    db.session.commit()
    return jsonify({'message': '已删除'})


# ─── API: Tasks ───────────────────────────────────────────────────────────────

@app.route('/api/tasks', methods=['GET'])
def list_tasks():
    q        = request.args.get('q', '').strip()
    status   = request.args.get('status', '').strip()
    priority = request.args.get('priority', '').strip()
    category = request.args.get('category', '').strip()
    flight_id = request.args.get('flight_id', '').strip()
    query = Task.query
    if q:
        like = f'%{q}%'
        query = query.filter(
            db.or_(Task.title.ilike(like), Task.assigned_to.ilike(like), Task.description.ilike(like))
        )
    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    if category:
        query = query.filter(Task.category == category)
    if flight_id:
        query = query.filter(Task.flight_id == int(flight_id))
    tasks = query.order_by(
        db.case({'urgent': 0, 'high': 1, 'normal': 2, 'low': 3}, value=Task.priority),
        Task.created_at.desc()
    ).all()
    return jsonify([t.to_dict() for t in tasks])


@app.route('/api/tasks/<int:tid>', methods=['GET'])
def get_task(tid):
    t = Task.query.get_or_404(tid)
    return jsonify(t.to_dict())


@app.route('/api/tasks', methods=['POST'])
def create_task():
    d = request.get_json(force=True)
    if not d.get('flight_id'):
        abort(400, description='缺少字段: flight_id')
    if not d.get('title'):
        abort(400, description='缺少字段: title')
    Flight.query.get_or_404(d['flight_id'])
    t = Task(
        flight_id   = d['flight_id'],
        title       = d['title'],
        description = d.get('description', ''),
        category    = d.get('category', 'general'),
        priority    = d.get('priority', 'normal'),
        status      = d.get('status', 'pending'),
        assigned_to = d.get('assigned_to', ''),
        due_time    = parse_dt(d.get('due_time')),
    )
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


@app.route('/api/tasks/<int:tid>', methods=['PUT'])
def update_task(tid):
    t = Task.query.get_or_404(tid)
    d = request.get_json(force=True)
    for field in ('title', 'description', 'category', 'priority', 'assigned_to'):
        if field in d:
            setattr(t, field, d[field])
    if 'status' in d:
        t.status = d['status']
        if d['status'] == 'completed' and not t.completed_at:
            t.completed_at = datetime.now(timezone.utc)
        elif d['status'] != 'completed':
            t.completed_at = None
    if 'due_time' in d:
        t.due_time = parse_dt(d['due_time'])
    t.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(t.to_dict())


@app.route('/api/tasks/<int:tid>', methods=['DELETE'])
def delete_task(tid):
    t = Task.query.get_or_404(tid)
    db.session.delete(t)
    db.session.commit()
    return jsonify({'message': '已删除'})


# ─── Error handlers ───────────────────────────────────────────────────────────

@app.errorhandler(400)
def bad_request(e):
    return jsonify({'error': str(e.description)}), 400


@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': '资源不存在'}), 404


@app.errorhandler(409)
def conflict(e):
    return jsonify({'error': str(e.description)}), 409


# ─── Bootstrap ────────────────────────────────────────────────────────────────

with app.app_context():
    db.create_all()
    seed_demo_data()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
