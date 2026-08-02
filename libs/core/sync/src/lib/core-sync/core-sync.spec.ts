import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoreSync } from './core-sync';

describe('CoreSync', () => {
  let component: CoreSync;
  let fixture: ComponentFixture<CoreSync>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoreSync]
    }).compileComponents();

    fixture = TestBed.createComponent(CoreSync);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
